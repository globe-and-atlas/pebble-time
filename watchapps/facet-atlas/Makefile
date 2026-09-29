# Host-side checks for Facet Atlas. The watch build itself is `pebble build`
# (see README.md); everything here runs without the Pebble SDK.

BUILD := build/host
CORE := src/c/fa_tile.c src/c/fa_xfer.c src/c/fa_render.c
STRICT := -std=c11 -Wall -Wextra -Werror -Wshadow -Wconversion -Wno-sign-conversion -Wcast-align -Wstrict-prototypes
SAN := -g -O1 -fsanitize=address,undefined -fno-sanitize-recover=all

.PHONY: all test test-js test-c lint typecheck preflight previews check clean

all: check

$(BUILD)/fixtures/expect.txt: $(wildcard src/pkjs/lib/*.js) test/js/fixtures.js tools/gen_fixtures.js
	node tools/gen_fixtures.js $(BUILD)/fixtures

$(BUILD)/core-objs.stamp: $(CORE) $(wildcard src/c/*.h)
	@mkdir -p $(BUILD)
	$(CC) $(STRICT) -fsyntax-only $(CORE)
	@touch $@

$(BUILD)/test_core: test/c/test_main.c $(CORE) $(wildcard src/c/*.h) $(BUILD)/core-objs.stamp
	$(CC) -std=c11 -Wall -Wextra -Werror $(SAN) -o $@ test/c/test_main.c $(CORE)

$(BUILD)/host_render: tools/host_render.c $(CORE) $(wildcard src/c/*.h)
	$(CC) -std=c11 -Wall -Wextra -Werror -O2 -o $@ tools/host_render.c $(CORE)

test-js:
	node --test test/js/*.test.js

test-c: $(BUILD)/test_core $(BUILD)/fixtures/expect.txt
	$(BUILD)/test_core $(BUILD)/fixtures

test: test-js test-c

DEV := tools/dev/node_modules/.bin

$(DEV)/eslint:
	npm --prefix tools/dev ci --no-audit --no-fund

lint: $(DEV)/eslint
	$(DEV)/eslint src/pkjs test tools eslint.config.js

typecheck: $(DEV)/eslint
	$(DEV)/tsc -p tsconfig.json
	$(CC) $(STRICT) -fsyntax-only $(CORE)
	$(CC) -std=c99 -Wall -Wextra -Werror -Wno-unused-parameter -Wformat-truncation=2 -fsyntax-only -Itest/c/stub src/c/main.c

preflight:
	node tools/preflight.js

previews: $(BUILD)/host_render $(BUILD)/fixtures/expect.txt
	python3 tools/previews.py

check: lint typecheck test preflight

clean:
	rm -rf $(BUILD)
