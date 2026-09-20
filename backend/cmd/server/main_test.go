package main

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestAllowedOriginWildcard(t *testing.T) {
	t.Setenv("CANVAS_CORS_ORIGINS", "*")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest("GET", "http://backend/api/health", nil)
	if !allowedOrigin(context, "https://example.com") {
		t.Fatal("wildcard CORS should allow a valid HTTPS origin")
	}
	if allowedOrigin(context, "ftp://example.com") {
		t.Fatal("wildcard CORS should reject non-HTTP origins")
	}
}

func TestCORSAllowsAgentEventCursorHeader(t *testing.T) {
	t.Setenv("CANVAS_CORS_ORIGINS", "https://app.example.com")
	middleware, err := cors()
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest("OPTIONS", "http://backend/api/agent/runs/run-1/events?after=0", nil)
	context.Request.Header.Set("Origin", "https://app.example.com")
	context.Request.Header.Set("Access-Control-Request-Method", "GET")
	context.Request.Header.Set("Access-Control-Request-Headers", "last-event-id")

	middleware(context)

	if recorder.Code != 204 {
		t.Fatalf("preflight status = %d", recorder.Code)
	}
	if !strings.Contains(strings.ToLower(recorder.Header().Get("Access-Control-Allow-Headers")), "last-event-id") {
		t.Fatalf("Last-Event-ID missing from Access-Control-Allow-Headers: %q", recorder.Header().Get("Access-Control-Allow-Headers"))
	}
}

func TestEnvironmentParsers(t *testing.T) {
	t.Setenv("CANVAS_AUTO_MIGRATE", "false")
	value, err := envBool("CANVAS_AUTO_MIGRATE", true)
	if err != nil || value {
		t.Fatalf("envBool = %v, %v", value, err)
	}
	t.Setenv("CANVAS_SHUTDOWN_TIMEOUT", "45s")
	duration, err := envDuration("CANVAS_SHUTDOWN_TIMEOUT", time.Minute)
	if err != nil || duration != 45*time.Second {
		t.Fatalf("envDuration = %v, %v", duration, err)
	}
}

func TestAllowedOriginUsesForwardedHost(t *testing.T) {
	t.Setenv("CANVAS_CORS_ORIGINS", "")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest("GET", "http://backend/api/health", nil)
	context.Request.Header.Set("X-Forwarded-Host", " canvas.example.com, proxy.internal")
	if !allowedOrigin(context, "https://canvas.example.com") {
		t.Fatal("forwarded public host should be treated as same-origin")
	}
}

func TestParseCORSPolicyNormalizesConfiguredOrigins(t *testing.T) {
	policy, err := parseCORSPolicy(" https://Canvas.example.com/ , http://localhost:3000 ")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := policy.origins["https://canvas.example.com"]; !ok {
		t.Fatal("configured origin was not normalized")
	}
	if _, ok := policy.origins["http://localhost:3000"]; !ok {
		t.Fatal("configured port was not preserved")
	}
}

func TestParseCORSPolicyRejectsNonOriginValue(t *testing.T) {
	if _, err := parseCORSPolicy("https://example.com/app"); err == nil {
		t.Fatal("path-bearing CORS value should be rejected")
	}
	if _, err := parseCORSPolicy("ftp://example.com"); err == nil {
		t.Fatal("non-HTTP CORS value should be rejected")
	}
}

func TestAllowedOriginConfiguredListDoesNotFallbackToArbitraryLocalhost(t *testing.T) {
	t.Setenv("CANVAS_CORS_ORIGINS", "https://app.example.com")
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest("GET", "http://backend/api/health", nil)
	if allowedOrigin(context, "http://localhost:3000") {
		t.Fatal("configured CORS list should disable the implicit localhost fallback")
	}
}

func TestRedactCanvasSharePath(t *testing.T) {
	got := redactCanvasSharePath("/api/public/canvas-shares/private-token/resources/resource-1/file")
	if got != "/api/public/canvas-shares/:token/resources/resource-1/file" {
		t.Fatalf("unexpected redacted path: %s", got)
	}
	if got := redactCanvasSharePath("/api/tasks"); got != "/api/tasks" {
		t.Fatalf("unrelated path changed: %s", got)
	}
}
