package logger

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	lumberjack "gopkg.in/natefinch/lumberjack.v2"
)

var (
	globalMu sync.RWMutex
	global   *zap.Logger = zap.NewNop()
	currentDate string
	currentLumber *lumberjack.Logger
)

type Options struct {
	Dir    string // logs directory
	Level  string // debug, info, warn, error
	Pretty bool   // colorized console output (in addition to file)
}

// Init creates a daily-rotating zap logger.
// File path: <dir>/choicehammer-YYYY-MM-DD.log
// Also writes a colorized, human-friendly stream to stdout.
func Init(opts Options) (*zap.Logger, error) {
	if opts.Dir == "" {
		opts.Dir = "logs"
	}
	if err := os.MkdirAll(opts.Dir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir logs: %w", err)
	}
	level := parseLevel(opts.Level)

	fileEnc := zapcore.NewJSONEncoder(jsonEncoderConfig())
	consoleEnc := zapcore.NewConsoleEncoder(consoleEncoderConfig(opts.Pretty))

	currentDate = time.Now().Format("2006-01-02")
	currentLumber = newLumber(opts.Dir, currentDate)

	core := zapcore.NewTee(
		zapcore.NewCore(fileEnc, zapcore.AddSync(currentLumber), level),
		zapcore.NewCore(consoleEnc, zapcore.AddSync(os.Stdout), level),
	)
	lg := zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))

	globalMu.Lock()
	global = lg
	globalMu.Unlock()

	go rotateDaily(opts.Dir, fileEnc, consoleEnc, level)
	return lg, nil
}

func newLumber(dir, date string) *lumberjack.Logger {
	return &lumberjack.Logger{
		Filename:   filepath.Join(dir, fmt.Sprintf("choicehammer-%s.log", date)),
		MaxSize:    100, // MB per file
		MaxBackups: 30,
		MaxAge:     90, // days
		Compress:   true,
	}
}

func rotateDaily(dir string, fileEnc, consoleEnc zapcore.Encoder, level zapcore.Level) {
	for {
		now := time.Now()
		next := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 1, 0, now.Location())
		time.Sleep(time.Until(next))

		newDate := time.Now().Format("2006-01-02")
		newLumberInst := newLumber(dir, newDate)

		core := zapcore.NewTee(
			zapcore.NewCore(fileEnc, zapcore.AddSync(newLumberInst), level),
			zapcore.NewCore(consoleEnc, zapcore.AddSync(os.Stdout), level),
		)
		newLogger := zap.New(core, zap.AddCaller(), zap.AddStacktrace(zapcore.ErrorLevel))

		globalMu.Lock()
		oldLumber := currentLumber
		currentLumber = newLumberInst
		currentDate = newDate
		global = newLogger
		globalMu.Unlock()

		if oldLumber != nil {
			_ = oldLumber.Close()
		}
		newLogger.Info("log file rotated", zap.String("date", newDate))
	}
}

func parseLevel(s string) zapcore.Level {
	switch s {
	case "debug":
		return zapcore.DebugLevel
	case "warn", "warning":
		return zapcore.WarnLevel
	case "error":
		return zapcore.ErrorLevel
	default:
		return zapcore.InfoLevel
	}
}

func jsonEncoderConfig() zapcore.EncoderConfig {
	cfg := zap.NewProductionEncoderConfig()
	cfg.TimeKey = "ts"
	cfg.MessageKey = "msg"
	cfg.LevelKey = "level"
	cfg.CallerKey = "caller"
	cfg.StacktraceKey = "stack"
	cfg.EncodeTime = zapcore.ISO8601TimeEncoder
	cfg.EncodeLevel = zapcore.LowercaseLevelEncoder
	cfg.EncodeDuration = zapcore.MillisDurationEncoder
	return cfg
}

func consoleEncoderConfig(pretty bool) zapcore.EncoderConfig {
	cfg := zap.NewDevelopmentEncoderConfig()
	cfg.TimeKey = "ts"
	cfg.MessageKey = "msg"
	cfg.LevelKey = "level"
	cfg.CallerKey = "caller"
	cfg.EncodeTime = zapcore.TimeEncoderOfLayout("15:04:05.000")
	cfg.EncodeDuration = zapcore.StringDurationEncoder
	if pretty {
		cfg.EncodeLevel = zapcore.CapitalColorLevelEncoder
	} else {
		cfg.EncodeLevel = zapcore.CapitalLevelEncoder
	}
	return cfg
}

func L() *zap.Logger {
	globalMu.RLock()
	defer globalMu.RUnlock()
	return global
}

func S() *zap.SugaredLogger { return L().Sugar() }

func Sync() {
	if l := L(); l != nil {
		_ = l.Sync()
	}
}

// Convenience helpers.
func Info(msg string, fields ...zap.Field)  { L().Info(msg, fields...) }
func Warn(msg string, fields ...zap.Field)  { L().Warn(msg, fields...) }
func Error(msg string, fields ...zap.Field) { L().Error(msg, fields...) }
func Debug(msg string, fields ...zap.Field) { L().Debug(msg, fields...) }
func Fatal(msg string, fields ...zap.Field) { L().Fatal(msg, fields...) }
