package api

import (
	"github.com/choicetechlab/choicehammer/internal/activity"
	"github.com/choicetechlab/choicehammer/internal/api/handlers"
	adminh "github.com/choicetechlab/choicehammer/internal/api/handlers/admin"
	pwh "github.com/choicetechlab/choicehammer/internal/api/handlers/postwomen"
	"github.com/choicetechlab/choicehammer/internal/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/config"
	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/choicetechlab/choicehammer/internal/jira"
	"github.com/choicetechlab/choicehammer/internal/teams"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

func New(cfg *config.Config, db *pgxpool.Pool, mgr *engine.Manager, teamSvc *teams.Service, actSvc *activity.Service, jiraClient *jira.Client) *gin.Engine {
	gin.SetMode(gin.ReleaseMode)
	r := gin.New()
	r.Use(middleware.RequestLogger())
	r.Use(middleware.Recovery())
	r.Use(middleware.CORS())

	r.GET("/healthz", func(c *gin.Context) { c.JSON(200, gin.H{"ok": true}) })

	auth := &handlers.AuthHandler{Teams: teamSvc, Activity: actSvc}
	r.POST("/api/auth/login", auth.Login)

	// Admin gate (separate from user auth, uses CH_ADMIN_KEY).
	ah := &adminh.Handler{Svc: teamSvc, AdminKey: cfg.AdminKey, Activity: actSvc}
	adminAct := &adminh.ActivityHandler{Svc: actSvc}
	r.POST("/api/admin/auth", ah.Auth)
	adminGrp := r.Group("/api/admin", ah.AuthMiddleware())
	adminGrp.GET("/teams",             ah.ListTeams)
	adminGrp.POST("/teams",            ah.CreateTeam)
	adminGrp.PATCH("/teams/:id",       ah.RenameTeam)
	adminGrp.DELETE("/teams/:id",      ah.DeleteTeam)
	adminGrp.POST("/teams/:id/rotate", ah.RotateKey)
	adminGrp.POST("/teams/:id/active", ah.SetActive)
	adminGrp.GET("/audit",             ah.AuditFeed)
	adminGrp.GET("/activity",          adminAct.Feed)
	adminGrp.GET("/activity/stats",    adminAct.Stats)
	// Same Jira health probe the user-side endpoint exposes — admins use it
	// from the Jira tab to verify the integration is up without needing an
	// access key.
	adminGrp.GET("/jira/health", func(c *gin.Context) {
		(&handlers.JiraHandler{Client: jiraClient}).Health(c)
	})

	protected := r.Group("/api", middleware.TeamAuth(teamSvc))
	protected.GET("/auth/verify", auth.Verify)

	// Client-side activity logger — frontend posts events for tool opens,
	// logout clicks, exports, etc. Backend trusts the team_id from the
	// auth context, never the body.
	act := &handlers.ActivityHandler{Svc: actSvc}
	protected.POST("/activity", act.Log)

	tests := &handlers.TestsHandler{DB: db}
	protected.GET("/tests", tests.List)
	protected.POST("/tests", tests.Create)
	protected.GET("/tests/:id", tests.Get)
	protected.PUT("/tests/:id", tests.Update)
	protected.DELETE("/tests/:id", tests.Delete)

	runs := &handlers.RunsHandler{DB: db, Manager: mgr, Activity: actSvc}
	protected.GET("/runs", runs.List)
	protected.POST("/runs", runs.Start)
	protected.GET("/runs/:id", runs.Status)
	protected.POST("/runs/:id/stop", runs.Stop)

	live := &handlers.LiveHandler{Manager: mgr}
	// SSE endpoint accepts key via ?key= for EventSource compatibility,
	// and is team-scoped so a key only ever streams its own team's runs.
	r.GET("/api/runs/:id/live", middleware.TeamAuth(teamSvc), live.Stream)

	reports := &handlers.ReportsHandler{DB: db}
	protected.GET("/reports/:id", reports.JSON)
	protected.GET("/reports/:id/html", reports.HTML)
	protected.GET("/reports/:id/pdf", reports.PDF)

	// Jira integration — health probe + attach-run-to-issue. The handler
	// gracefully refuses if the env-driven client is nil.
	jiraH := &handlers.JiraHandler{DB: db, Client: jiraClient, Activity: actSvc}
	protected.GET("/jira/health", jiraH.Health)
	protected.GET("/jira/issue/:key", jiraH.LookupIssue)
	protected.POST("/runs/:id/attach-jira", jiraH.AttachRun)
	protected.GET("/runs/:id/jira-attachments", jiraH.ListAttachments)

	cmp := &handlers.CompareHandler{DB: db}
	protected.GET("/compare", cmp.Compare)

	// PostWomen — companion API testing module.
	pw := &pwh.Handler{DB: db}
	protected.GET("/postwomen/workspaces",        pw.ListWorkspaces)
	protected.POST("/postwomen/workspaces",       pw.CreateWorkspace)
	protected.DELETE("/postwomen/workspaces/:id", pw.DeleteWorkspace)
	protected.GET("/postwomen/workspaces/:id/tree", pw.Tree)
	protected.POST("/postwomen/collections",        pw.CreateCollection)
	protected.PATCH("/postwomen/collections/:id",   pw.RenameCollection)
	protected.DELETE("/postwomen/collections/:id",  pw.DeleteCollection)
	protected.POST("/postwomen/requests",      pw.CreateRequest)
	protected.PUT("/postwomen/requests/:id",   pw.UpdateRequest)
	protected.DELETE("/postwomen/requests/:id",pw.DeleteRequest)
	protected.POST("/postwomen/send",          pw.Send)
	protected.POST("/postwomen/import",        pw.Import)
	protected.GET("/postwomen/export/:id",     pw.Export)
	protected.GET("/postwomen/history",        pw.History)

	cost := &handlers.CostHandler{}
	protected.GET("/cost/pricing", cost.Pricing)

	envs := &handlers.EnvironmentsHandler{DB: db}
	protected.GET("/environments", envs.List)
	protected.POST("/environments", envs.Create)
	protected.DELETE("/environments/:id", envs.Delete)

	return r
}
