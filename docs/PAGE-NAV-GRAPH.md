# 페이지 간 이동 그래프 (2026-08-23, 동선 정리 2단계 이후)

> `IA-REVIEW.md`(같은 세션 이전 산출물)에서 지적된 항목들을 반영한 뒤의 최종 상태.
> 무엇이 바뀌었는지는 문서 끝의 "이전 대비 변경점" 참고.

```mermaid
graph LR
  Home["index.html<br/>(홈, 3카드: 뽑기/연성/캐릭터)"]

  subgraph Draw["캐릭터 / 뽑기"]
    Character["character.html<br/>(목록 ↔ 상세)"]
    Random["random.html<br/>(뽑기 실행)"]
    RandomAdmin["random-admin.html<br/>(뽑기 설정 콘솔)"]
  end

  Personal["personal.html?user=<br/>(개인 저장소, 통합됨)"]

  subgraph StoryG["연성 글"]
    SL["story-list.html"]
    SV["story-view.html"]
    SW["story-write.html"]
  end

  subgraph ImageG["그림"]
    IL["image-list.html"]
    IV["image-view.html"]
    IW["image-write.html"]
  end

  Feed["feed.html<br/>(최신 피드, 舊 timeline.html)"]

  Home --> Character
  Home --> Random
  Home --> SL
  Home --> IL
  Home --> Feed

  Random -- "🔧 뽑기 설정" --> RandomAdmin
  RandomAdmin -- "🎲 랜덤 뽑기" --> Random
  Random -.글 목록.-> SL

  Personal -- "← 홈" --> Home
  Personal -.뽑기·글·그림.-> Random & SL & IL
  Personal -."보관함 항목 클릭"(동적).-> SV & IV
  Character -.."전역 위젯(personal-nav.js)".-> Personal
  Random -.."전역 위젯".-> Personal
  RandomAdmin -.."전역 위젯".-> Personal
  SL -.."전역 위젯".-> Personal
  SV -.."전역 위젯".-> Personal
  SW -.."전역 위젯".-> Personal
  IL -.."전역 위젯".-> Personal
  IV -.."전역 위젯".-> Personal
  IW -.."전역 위젯".-> Personal
  Feed -.."전역 위젯".-> Personal

  Character -."행 클릭 (?id=)".-> Character
  Character -- "← 홈" --> Home

  SL <-.그림 목록↔글 목록.-> IL
  SL -."카드 클릭(?pid=)".-> SV
  SL -."＋ 새 글".-> SW
  IL -."카드 클릭(?pid=)".-> IV
  IL -."＋ 새 그림".-> IW
  Feed -."피드 카드(동적)".-> SV & IV

  SV -- "← 목록" --> SL
  SV -."편집".-> SW
  SV -."태그된 캐릭터 초상화".-> Character
  IV -- "← 목록" --> IL
  IV -."편집".-> IW

  SW -."취소/삭제".-> SL
  SW == "저장 성공 →" ==> SV
  IW -."취소/삭제".-> IL
  IW == "저장 성공 →" ==> IV
```

**굵은 화살표**(`SW → SV`, `IW → IV`)가 이번에 새로 생긴 경로 — 글/그림을 저장하면 이제 목록으로
나가지 않고 바로 방금 쓴 글/그림의 보기 화면으로 이동한다.

## 고아 페이지 확인

**실제 콘텐츠 페이지 12개 전부, 홈에서 출발해 도달 가능** — 고아 없음.

- `random-admin.html`은 여전히 홈 메뉴엔 없고 `random.html`의 "🔧 뽑기 설정" 링크로만 진입(의도적
  — 이번 정리에서 "random-admin.html은 홈 메뉴에 넣지 않는다"를 명시적으로 유지).
- `personal.html?user=`는 홈 메뉴에 없고, `index.html`을 제외한 모든 페이지에 뜨는
  `personal-nav.js` 전역 위젯을 통해서만 진입 가능(의도된 설계 — 이번 정리 항목 ①).

**리다이렉트 stub 4개는 의도적으로 어디서도 링크 안 됨**(옛 URL을 직접 치거나 북마크했을 때만
접근) — 진짜 고아가 아니라 "죽지 않은 옛 주소":
- `personal/kimgyong.html`, `personal/haji.html`, `personal/yeming.html` → `personal.html?user=…`
- `story/timeline.html` → `story/feed.html`

## 이전(`IA-REVIEW.md`) 대비 변경점

- 홈 메뉴가 4카드(뽑기/연성/캐릭터/**나만의 저장소**)에서 3카드로 축소 — "나만의 저장소" 카드와
  그 하위 유저 선택 서브메뉴 제거. 저장소 진입은 전역 위젯 하나로 통일.
- `personal/{kimgyong,haji,yeming}.html` 3파일 → `personal.html?user=` 1파일로 통합, 옛 경로는
  redirect stub.
- `story/timeline.html` → `story/feed.html`로 개명(+홈 메뉴 라벨 "타임라인"→"최신 피드").
- `story-write.html`/`image-write.html` 저장 성공 시 더 이상 작성 화면에 안 머무르고 방금
  저장한 글/그림의 보기 화면으로 이동 — 이전 리뷰가 지적한 "저장 후 확인할 길이 없는 막다른 길"
  해소.
- `random.html`의 "🔧 관리자 모드" 라벨 → "🔧 뽑기 설정"(목적지는 그대로 `random-admin.html`).
