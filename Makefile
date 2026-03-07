# -------------------------------------------------------------------------
# mactrack — top-level Makefile
# -------------------------------------------------------------------------
# Targets:
#   make run          — run the local dev server (port 8080)
#   make build-lambda — cross-compile for AWS Lambda (linux/amd64)
#   make build-MactrackFunction — called by `sam build`
#   make deploy       — build + deploy via SAM (requires AWS credentials)
# -------------------------------------------------------------------------

BINARY      := bootstrap
LAMBDA_DIR  := .aws-sam/build/MactrackFunction

.PHONY: run build-lambda build-MactrackFunction deploy

# Local dev server
run:
	go run ./cmd/api

# Build for Lambda (produces ./bootstrap ready to zip or sam deploy)
build-lambda:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		go build -tags lambda.norpc -o $(BINARY) ./cmd/lambda

# Hook called by `sam build` — output binary must land in $ARTIFACTS_DIR
build-MactrackFunction:
	GOOS=linux GOARCH=amd64 CGO_ENABLED=0 \
		go build -tags lambda.norpc -o $(ARTIFACTS_DIR)/bootstrap ./cmd/lambda

# Full SAM deploy (first run will do `sam deploy --guided` automatically)
deploy: build-lambda
	sam build
	sam deploy
