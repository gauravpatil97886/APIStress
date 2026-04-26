package api

import (
	"github.com/choicetechlab/choicehammer/internal/api/handlers"
	"github.com/choicetechlab/choicehammer/internal/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/config"
	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func New(cfg *config.Config, db *pgxpool.Pool, mgr *engine.Manager) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(middleware.RequestLogger())
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS())

	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	auth := &handlers.AuthHandler{ExpectedKey: cfg.AccessKey}
	r.POST("/api/auth/login", auth.Login)

	protected := r.Group("/api", middleware.KeyAuth(cfg.AccessKey))
	protected.GET("/auth/verify", auth.Verify)

	tests := &handlers.TestsHandler{DB: db}
	protected.GET("/tests", tests.List)
	protected.POST("/tests", tests.Create)
	protected.GET("/tests/:id", tests.Get)
	protected.PUT("/tests/:id", tests.Update)
	protected.DELETE("/tests/:id", tests.Delete)

	runs := &handlers.RunsHandler{DB: db, Manager: mgr}
	protected.GET("/runs", runs.List)
	protected.POST("/runs", runs.Start)
	protected.GET("/runs/:id", runs.Status)
	protected.POST("/runs/:id/stop", runs.Stop)

	live := &handlers.LiveHandler{Manager: mgr}
	// SSE endpoint accepts key via ?key= for EventSource compatibility.
	r.GET("/api/runs/:id/live", middleware.KeyAuth(cfg.AccessKey), live.Stream)

	reports := &handlers.ReportsHandler{DB: db}
	protected.GET("/reports/:id", reports.JSON)
	protected.GET("/reports/:id/html", reports.HTML)
	protected.GET("/reports/:id/pdf", reports.PDF)

	cmp := &handlers.CompareHandler{DB: db}
	protected.GET("/compare", cmp.Compare)

	envs := &handlers.EnvironmentsHandler{DB: db}
	protected.GET("/environments", envs.List)
	protected.POST("/environments", envs.Create)
	protected.DELETE("/environments/:id", envs.Delete)

	return r
}
