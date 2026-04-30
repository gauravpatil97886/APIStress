package handlers

import (
	"net/http"

	"github.com/choicetechlab/choicehammer/internal/tools/apistress/cost"
	"github.com/gin-gonic/gin"
)

type CostHandler struct{}

// Pricing exposes the full static catalogue (clouds + stack components) for the picker UI.
func (h *CostHandler) Pricing(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"clouds":     cost.Catalogue,
		"stack":      cost.Stack,
		"categories": cost.StackCategories,
	})
}
