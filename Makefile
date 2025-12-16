.PHONY: install watch compile package clean lint dev

# Install dependencies
install:
	npm install

# Development mode with watch
watch:
	npm run watch

# Development shortcut
dev: install watch

# Compile TypeScript
compile:
	npm run compile

# Package extension
package: compile
	npm run package

# Run linter
lint:
	npm run lint

# Clean build artifacts
clean:
	rm -rf dist
	rm -rf node_modules
	rm -f *.vsix

# Full rebuild
rebuild: clean install compile

# Show help
help:
	@echo "Available commands:"
	@echo "  make install   - Install dependencies"
	@echo "  make watch     - Start development mode with watch"
	@echo "  make dev       - Install and start watch mode"
	@echo "  make compile   - Compile TypeScript"
	@echo "  make package   - Package extension as .vsix"
	@echo "  make lint      - Run linter"
	@echo "  make clean     - Clean build artifacts"
	@echo "  make rebuild   - Full rebuild from scratch"
