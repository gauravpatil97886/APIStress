package engine

// Semaphore bounds concurrent VU goroutines so we never exceed the target
// VU count even during ramp-up bursts.
type Semaphore chan struct{}

func NewSemaphore(max int) Semaphore {
	if max < 1 {
		max = 1
	}
	return make(Semaphore, max)
}

func (s Semaphore) Acquire() { s <- struct{}{} }
func (s Semaphore) Release() { <-s }
func (s Semaphore) Cap() int { return cap(s) }
