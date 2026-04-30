package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

// LoginRateLimiter is an in-memory token-bucket per remote IP. Used to
// shut down brute-force attempts against /api/auth/login (the one
// endpoint where an attacker without a key can repeatedly probe).
//
// Internal-tool scope keeps this simple — no Redis, no distributed
// state. A multi-replica deployment trades a little fairness (the limit
// becomes per-replica rather than per-cluster) for zero new
// dependencies. Buckets self-evict after `idleTTL` of inactivity so the
// map can't grow unbounded.
type LoginRateLimiter struct {
	mu       sync.Mutex
	buckets  map[string]*ipBucket
	capacity int           // tokens per window
	window   time.Duration // refill window
	idleTTL  time.Duration // evict buckets idle this long
}

type ipBucket struct {
	tokens   int
	resetAt  time.Time
	lastSeen time.Time
}

// NewLoginRateLimiter allows up to `capacity` attempts per `window` per IP.
// 10 attempts/min is the documented default and lets a fat-fingered human
// retry comfortably while still stopping a script that tries 600/min.
func NewLoginRateLimiter(capacity int, window time.Duration) *LoginRateLimiter {
	if capacity <= 0 {
		capacity = 10
	}
	if window <= 0 {
		window = time.Minute
	}
	rl := &LoginRateLimiter{
		buckets:  make(map[string]*ipBucket),
		capacity: capacity,
		window:   window,
		idleTTL:  10 * time.Minute,
	}
	// Background sweeper — keeps the map bounded under attack.
	go rl.sweep()
	return rl
}

func (rl *LoginRateLimiter) sweep() {
	t := time.NewTicker(rl.idleTTL)
	defer t.Stop()
	for range t.C {
		cutoff := time.Now().Add(-rl.idleTTL)
		rl.mu.Lock()
		for k, b := range rl.buckets {
			if b.lastSeen.Before(cutoff) {
				delete(rl.buckets, k)
			}
		}
		rl.mu.Unlock()
	}
}

// Allow consumes a token for `ip`, returning false if the IP has used up
// its quota for the current window.
func (rl *LoginRateLimiter) Allow(ip string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()
	b, ok := rl.buckets[ip]
	if !ok || now.After(b.resetAt) {
		b = &ipBucket{tokens: rl.capacity, resetAt: now.Add(rl.window)}
		rl.buckets[ip] = b
	}
	b.lastSeen = now
	if b.tokens <= 0 {
		return false
	}
	b.tokens--
	return true
}

// Middleware returns a gin handler that 429s on rate-limit miss.
func (rl *LoginRateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !rl.Allow(c.ClientIP()) {
			c.Writer.Header().Set("Retry-After", "60")
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"error": "too many login attempts — please wait a minute and try again",
			})
			return
		}
		c.Next()
	}
}
