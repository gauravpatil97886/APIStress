package protocols

import (
	"github.com/choicetechlab/choicehammer/internal/tools/apistress/engine"
)

type Executor = engine.Executor

func New(cfg *engine.TestConfig) (engine.Executor, error) {
	switch cfg.Protocol {
	case engine.ProtoHTTP, "":
		return NewHTTPExecutor(cfg)
	case engine.ProtoWebSocket:
		return NewWebSocketExecutor(cfg)
	default:
		return NewHTTPExecutor(cfg)
	}
}
