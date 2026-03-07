package main

import (
	"log"
	"os"

	"mactrack/pkg"

	"github.com/aws/aws-lambda-go/lambda"
	"github.com/awslabs/aws-lambda-go-api-proxy/httpadapter"
	"github.com/joho/godotenv"
)

func init() {
	// .env is ignored in Lambda; vars come from the function's environment config.
	_ = godotenv.Load()
}

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL environment variable must be set")
	}

	repo, err := pkg.NewRepository(dsn)
	if err != nil {
		log.Fatalf("failed to open repository: %v", err)
	}

	svc := &pkg.Service{Repo: repo}
	mux := pkg.NewMux(repo, svc)

	// httpadapter.NewV2 adapts a standard http.Handler for API Gateway HTTP API (v2).
	lambda.Start(httpadapter.NewV2(pkg.CORS(mux)).ProxyWithContext)
}
