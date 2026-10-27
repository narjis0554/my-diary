# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A shared calendar + daily diary web app (Korean UI). Static files only — no build system, package manager, linter, or test suite. Backend is Supabase (Postgres + Google login); hosting is Vercel.

- `index.html` — page skeleton: login gate, 📅 calendar tab, 📔 diary tab, event dialog.
- `style.css` — all styles. Colors are CSS custom properties on `:root` with a `prefers-color-scheme: dark` override; change variables, not hard-coded colors. Mobile tweaks live in the `max-width: 600px` block.
- `app.js` — Supabase client (loaded from CDN as the global `supabase`), auth, calendar and diary logic. `SUPABASE_URL` / `SUPABASE_ANON_KEY` at the top are public values; never put the `service_role` key here.
- `supabase.sql` — schema to paste into Supabase SQL Editor: `profiles` (auto-created by trigger on first login), `events`, `diary` (one row per user per day).

## Privacy model

Every `events` and `diary` row has `is_public`. RLS policies let logged-in users read rows that are public or their own, and write only their own. Any new table must enable RLS with the same pattern.

## Running locally

Supabase OAuth needs an http origin, not `file://`:

    python -m http.server 3000

`http://localhost:3000` must be listed in Supabase → Authentication → URL Configuration. Google login uses a full-page redirect, so it can be tested in a normal browser.

## Working rules

- 요청한 부분만 고치고, 고치기 전에 무엇을 바꿀지 먼저 말해줘.
- 날짜는 항상 로컬 기준 'YYYY-MM-DD' 문자열로 다룬다 (`ymd()`, `parseYmd()`, `addDays()` 사용).
- 사용자가 입력한 값은 화면에 넣기 전에 `escapeHtml()`을 거친다.
