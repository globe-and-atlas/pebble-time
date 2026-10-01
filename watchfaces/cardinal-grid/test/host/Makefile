# Host-side build of Cardinal Grid against the mock SDK. No Pebble SDK required.
#
#   make test          strict build + sanitizers + all checks
#   make variants      compile-check the CG_DEBUG and CG_WATCHAPP builds
#   make frames        write preview frames to build/frames (then: python3 preview.py)
#
SRC  := ../../src/c
CC   ?= gcc
WARN := -Wall -Wextra -Wpedantic -Wshadow -Wformat=2 -Wundef -Werror
CFLAGS := -std=gnu11 -g -O1 $(WARN) -fsanitize=address,undefined -fno-omit-frame-pointer -Imock -I$(SRC)
LIBS := -lm

MODULES := $(SRC)/orientation/orientation.c $(SRC)/grid/grid.c $(SRC)/map_geometry/map_geometry.c \
           $(SRC)/rendering/render.c $(SRC)/rendering/redraw_gate.c $(SRC)/time/clock.c mock/pebble_mock.c

BUILD := build

.PHONY: test variants frames clean
test: $(BUILD)/test_cardinal
	$(BUILD)/test_cardinal

$(BUILD)/test_cardinal: test_cardinal.c $(MODULES) $(SRC)/cardinal_grid.c mock/pebble.h mock/mock_control.h
	@mkdir -p $(BUILD)
	$(CC) $(CFLAGS) -o $@ test_cardinal.c $(MODULES) $(LIBS)

# The optional builds must at least compile cleanly under the same warnings.
variants:
	@mkdir -p $(BUILD)
	$(CC) $(CFLAGS) -DCG_DEBUG=1 -o $(BUILD)/test_debug test_cardinal.c $(MODULES) $(LIBS) && $(BUILD)/test_debug | tail -2
	$(CC) $(CFLAGS) -DCG_WATCHAPP=1 -o $(BUILD)/test_watchapp test_cardinal.c $(MODULES) $(LIBS) && $(BUILD)/test_watchapp | tail -2

frames: $(BUILD)/test_cardinal
	@mkdir -p $(BUILD)/frames
	$(BUILD)/test_cardinal frames $(BUILD)/frames

clean:
	rm -rf $(BUILD)
