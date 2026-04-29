package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/choicetechlab/choicehammer/internal/api/middleware"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EnvironmentsHandler struct {
	DB *pgxpool.Pool
}

type envBody struct {
	Name    string            `json:"name"`
	BaseURL string            `json:"base_url"`
	Headers map[string]string `json:"headers"`
}

func (h *EnvironmentsHandler) List(c *gin.Context) {
	team := middleware.TeamID(c)
	rows, err := h.DB.Query(c.Request.Context(),
		`SELECT id, name, base_url, headers, created_at FROM environments WHERE team_id=$1 ORDER BY name`, team)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()
	out := []gin.H{}
	for rows.Next() {
		var id, name, base string
		var created time.Time
		var headersRaw []byte
		if err := rows.Scan(&id, &name, &base, &headersRaw, &created); err != nil {
			continue
		}
		var headers map[string]string
		_ = json.Unmarshal(headersRaw, &headers)
		out = append(out, gin.H{
			"id": id, "name": name, "base_url": base, "headers": headers, "created_at": created,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *EnvironmentsHandler) Create(c *gin.Context) {
	var body envBody
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if body.Name == "" || body.BaseURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "name and base_url required"})
		return
	}
	if body.Headers == nil {
		body.Headers = map[string]string{}
	}
	team := middleware.TeamID(c)
	var teamArg interface{}
	if team != "" {
		teamArg = team
	}
	id := newID()
	headersJSON, _ := json.Marshal(body.Headers)
	_, err := h.DB.Exec(c.Request.Context(),
		`INSERT INTO environments (id, name, base_url, headers, team_id) VALUES ($1, $2, $3, $4, $5)`,
		id, body.Name, body.BaseURL, headersJSON, teamArg,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

func (h *EnvironmentsHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	team := middleware.TeamID(c)
	_, err := h.DB.Exec(c.Request.Context(), `DELETE FROM environments WHERE id=$1 AND team_id=$2`, id, team)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
