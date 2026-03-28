# Phase 3: 핵심 페이지 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development

**Goal:** 복지 목록/상세, 대출 목록/상세, 달력, 통합 검색 API를 Supabase 실제 데이터로 구현한다.

**Architecture:** Server Components에서 Supabase 서버 클라이언트로 데이터 fetch. ISR(revalidate=3600)로 상세 페이지 캐싱. 목록 페이지는 URL searchParams로 필터/검색/페이지네이션. 달력은 클라이언트 컴포넌트로 인터랙션 처리.

**Tech Stack:** Next.js App Router, Supabase server client, TypeScript

---

## Tasks

### Task 1: 홈페이지를 Supabase 실데이터로 전환
### Task 2: /welfare 복지 목록 페이지
### Task 3: /welfare/[id] 복지 상세 페이지
### Task 4: /loan 대출 목록 + /loan/[id] 대출 상세
### Task 5: /calendar 달력 페이지
### Task 6: /api/search 통합 검색 API
