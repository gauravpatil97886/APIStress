package protocols

import (
	"context"
	"crypto/tls"
	"net/http"
	"time"

	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/gorilla/websocket"
)

type WebSocketExecutor struct {
	cfg    *engine.TestConfig
	dialer *websocket.Dialer
}

func NewWebSocketExecutor(cfg *engine.TestConfig) (*WebSocketExecutor, error) {
	d := &websocket.Dialer{
		Proxy:            http.ProxyFromEnvironment,
		HandshakeTimeout: time.Duration(cfg.Request.Timeout) * time.Millisecond,
		TLSClientConfig:  &tls.Config{InsecureSkipVerify: true},
	}
	return &WebSocketExecutor{cfg: cfg, dialer: d}, nil
}

func (e *WebSocketExecutor) Execute(ctx context.Context) engine.Result {
	r := engine.Result{StartedAt: time.Now()}
	hdr := http.Header{}
	for k, v := range e.cfg.Request.Headers {
		hdr.Set(k, v)
	}
	conn, resp, err := e.dialer.DialContext(ctx, e.cfg.Request.URL, hdr)
	if err != nil {
		r.Err = err.Error()
		if resp != nil {
			r.Status = resp.StatusCode
		}
		r.DurationUs = time.Since(r.StartedAt).Microseconds()
		return r
	}
	defer conn.Close()
	r.Status = resp.StatusCode
	if e.cfg.Request.Body != "" {
		if err := conn.WriteMessage(websocket.TextMessage, []byte(e.cfg.Request.Body)); err != nil {
			r.Err = err.Error()
			r.DurationUs = time.Since(r.StartedAt).Microseconds()
			return r
		}
		r.BytesOut = int64(len(e.cfg.Request.Body))
		_ = conn.SetReadDeadline(time.Now().Add(time.Duration(e.cfg.Request.Timeout) * time.Millisecond))
		_, msg, err := conn.ReadMessage()
		if err != nil {
			r.Err = err.Error()
		} else {
			r.BytesIn = int64(len(msg))
		}
	}
	r.DurationUs = time.Since(r.StartedAt).Microseconds()
	return r
}

func (e *WebSocketExecutor) Close() {}
