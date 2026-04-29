package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/choicetechlab/choicehammer/internal/api/middleware"
	"github.com/choicetechlab/choicehammer/internal/engine"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TestsHandler struct {
	DB *pgxpool.Pool
}

type testRow struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Config      engine.TestConfig `json:"config"`
	CreatedAt   time.Time         `json:"created_at"`
	UpdatedAt   time.Time         `json:"updated_at"`
}

func (h *TestsHandler) List(c *gin.Context) {
	team := middleware.TeamID(c)
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, name, description, config, created_at, updated_at FROM tests WHERE team_id=$1 ORDER BY updated_at DESC`, team)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []testRow{}
	for rows.Next() {
		var r testRow
		var cfg []byte
		var created, updated time.Time
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &cfg, &created, &updated); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		_ = json.Unmarshal(cfg, &r.Config)
		r.CreatedAt = created
		r.UpdatedAt = updated
		out = append(out, r)
	}
	c.JSON(http.StatusOK, out)
}

func (h *TestsHandler) Create(c *gin.Context) {
	var body struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Config      engine.TestConfig `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := body.Config.Validate(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	team := middleware.TeamID(c)
	var teamArg interface{}
	if team != "" {
		teamArg = team
	}
	id := newID()
	cfgJSON, _ := json.Marshal(body.Config)
	_, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO tests (id, name, description, config, team_id) VALUES ($1, $2, $3, $4, $5)`,
		id, body.Name, body.Description, cfgJSON, teamArg,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *TestsHandler) Get(c *gin.Context) {
	id := c.Param("id")
	team := middleware.TeamID(c)
	row := h.DB.QueryRow(c.Request.Context(),
		`SELECT id, name, description, config, created_at, updated_at FROM tests WHERE id=$1 AND team_id=$2`, id, team)
	var r testRow
	var cfg []byte
	var created, updated time.Time
	if err := row.Scan(&r.ID, &r.Name, &r.Description, &cfg, &created, &updated); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	_ = json.Unmarshal(cfg, &r.Config)
	r.CreatedAt = created
	r.UpdatedAt = updated
	c.JSON(http.StatusOK, r)
}

func (h *TestsHandler) Update(c *gin.Context) {
	id := c.Param("id")
	var body struct {
		Name        string            `json:"name"`
		Description string            `json:"description"`
		Config      engine.TestConfig `json:"config"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	team := middleware.TeamID(c)
	cfgJSON, _ := json.Marshal(body.Config)
	tag, err := h.DB.Exec(c.Request.Context(),
		`UPDATE tests SET name=$1, description=$2, config=$3, updated_at=NOW() WHERE id=$4 AND team_id=$5`,
		body.Name, body.Description, cfgJSON, id, team,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	if tag.RowsAffected() == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	c.Status(http.StatusNoContent)
}

func (h *TestsHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	team := middleware.TeamID(c)
	_, err := h.DB.Exec(c.Request.Context(), `DELETE FROM tests WHERE id=$1 AND team_id=$2`, id, team)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
