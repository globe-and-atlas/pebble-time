#pragma once
#include <stdint.h>
#define FACE_W 200
#define FACE_H 228
#define FACE_PALETTE_SIZE 74
extern const uint8_t face_palette[FACE_PALETTE_SIZE][3];
void face_sun(int year,int doy,int utc_minute,float *declination,float *longitude);
/* Native incremental rendering: prepare until ready, then overlay rows [first,end).
 * Callers supply valid coordinates and rows within [37,192). */
int face_globe_prepare(int latitude,int longitude,int rows);
void face_globe_overlay_rows(int h,int m,int utc_year,int doy,int utc_minute,
                        int latitude,int longitude,int marker,uint8_t *pixels,int first,int end);
void face_globe_overlay(int h,int m,int utc_year,int doy,int utc_minute,
                        int latitude,int longitude,int marker,uint8_t *pixels);
int face_special(int hour, int minute);
int face_angle(int hour, int minute);
void face_label(int hour, int minute, char *out);
void face_render(int hour, int minute, uint8_t *pixels);
typedef struct {
 int x, y, width, height, scale;
 char text[3];
} FaceNumber;
int face_minute_angle(int minute);
void face_split_layout(int hour, int minute, FaceNumber *labels);
void face_render_split(int hour, int minute, uint8_t *pixels);
/* mask: weekday=1, day=2, month=4, year=8; position: top=0, bottom=1.
 * weekday uses struct tm numbering (Sunday=0). Output text needs 32 bytes. */
void face_date_text(int year,int month,int day,int weekday,int mask,char *out);
void face_render_config(int hour,int minute,int edition,int year,int month,int day,
                        int weekday,int mask,int position,uint8_t *pixels);
void face_render_custom(int hour,int minute,int edition,int year,int month,int day,
                        int weekday,int mask,int position,int font,int hand_color,
                        int minute_color,int hand_width,int minute_width,uint8_t *pixels);
