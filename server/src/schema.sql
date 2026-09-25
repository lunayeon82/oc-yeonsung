-- oc-yeonsung tables. Prefixed with oc_ because shared.db will be shared with the 포켓리스 app.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS oc_owners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS oc_subgroups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL REFERENCES oc_owners(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  code TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS oc_characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_code TEXT UNIQUE,
  subgroup_id INTEGER REFERENCES oc_subgroups(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender INTEGER NOT NULL DEFAULT 0,
  is_couple INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  info_look TEXT,
  info_vibe TEXT,
  info_speech TEXT,
  info_speech_ex TEXT,
  info_personality TEXT,
  info_habits TEXT
);
CREATE INDEX IF NOT EXISTS idx_oc_characters_subgroup ON oc_characters(subgroup_id);

CREATE TABLE IF NOT EXISTS oc_character_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES oc_characters(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oc_character_sections_char ON oc_character_sections(character_id);

CREATE TABLE IF NOT EXISTS oc_role_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS oc_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES oc_role_groups(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oc_roles_group ON oc_roles(group_id);

CREATE TABLE IF NOT EXISTS oc_au_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS oc_aus (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES oc_au_groups(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_oc_aus_group ON oc_aus(group_id);

CREATE TABLE IF NOT EXISTS oc_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS oc_stories (
  pid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  rating TEXT NOT NULL DEFAULT '',
  excerpt TEXT NOT NULL DEFAULT '',
  chapter_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_stories_updated ON oc_stories(updated_at DESC);

CREATE TABLE IF NOT EXISTS oc_story_characters (
  story_pid TEXT NOT NULL REFERENCES oc_stories(pid) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  PRIMARY KEY (story_pid, character_name)
);
CREATE INDEX IF NOT EXISTS idx_oc_story_characters_name ON oc_story_characters(character_name);

CREATE TABLE IF NOT EXISTS oc_story_roles (
  story_pid TEXT NOT NULL REFERENCES oc_stories(pid) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY (story_pid, role)
);

CREATE TABLE IF NOT EXISTS oc_story_aus (
  story_pid TEXT NOT NULL REFERENCES oc_stories(pid) ON DELETE CASCADE,
  au TEXT NOT NULL,
  PRIMARY KEY (story_pid, au)
);

CREATE TABLE IF NOT EXISTS oc_chapters (
  pid TEXT PRIMARY KEY,
  story_pid TEXT NOT NULL REFERENCES oc_stories(pid) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  title TEXT,
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_chapters_story ON oc_chapters(story_pid);

CREATE TABLE IF NOT EXISTS oc_images (
  pid TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  thumb_chapter_pid TEXT,
  thumb_path TEXT,
  chapter_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_images_updated ON oc_images(updated_at DESC);

CREATE TABLE IF NOT EXISTS oc_image_characters (
  image_pid TEXT NOT NULL REFERENCES oc_images(pid) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  PRIMARY KEY (image_pid, character_name)
);
CREATE INDEX IF NOT EXISTS idx_oc_image_characters_name ON oc_image_characters(character_name);

CREATE TABLE IF NOT EXISTS oc_image_tags (
  image_pid TEXT NOT NULL REFERENCES oc_images(pid) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY (image_pid, tag)
);
CREATE INDEX IF NOT EXISTS idx_oc_image_tags_tag ON oc_image_tags(tag);

CREATE TABLE IF NOT EXISTS oc_image_chapters (
  pid TEXT PRIMARY KEY,
  image_pid TEXT NOT NULL REFERENCES oc_images(pid) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  image_path TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_image_chapters_image ON oc_image_chapters(image_pid);

CREATE TABLE IF NOT EXISTS oc_comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('story', 'image')),
  parent_pid TEXT NOT NULL,
  chapter_pid TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_comments_parent ON oc_comments(parent_type, parent_pid);

CREATE TABLE IF NOT EXISTS oc_draw_box (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES oc_users(id) ON DELETE CASCADE,
  names TEXT NOT NULL,
  roles TEXT NOT NULL,
  au TEXT,
  memo TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_draw_box_user ON oc_draw_box(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS oc_read_later (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES oc_users(id) ON DELETE CASCADE,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('story', 'image')),
  parent_pid TEXT NOT NULL,
  title_snapshot TEXT,
  added_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_read_later_user ON oc_read_later(user_id, added_at DESC);

CREATE TABLE IF NOT EXISTS oc_story_box (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES oc_users(id) ON DELETE CASCADE,
  parent_type TEXT NOT NULL CHECK (parent_type IN ('story', 'image')),
  parent_pid TEXT NOT NULL,
  title_snapshot TEXT,
  added_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_oc_story_box_user ON oc_story_box(user_id, added_at DESC);

CREATE TABLE IF NOT EXISTS oc_meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 연성 글 본문에 <img="Do A-rang acting coy"> 형태로 삽입하는 감정 에셋.
-- lookup_key는 본문 토큰과 대조하기 위한 정규화 키(영숫자만 남기고 소문자화)로,
-- 이름/감정의 언더바·점·띄어쓰기 표기가 달라도 같은 이미지를 찾을 수 있게 한다.
CREATE TABLE IF NOT EXISTS oc_emotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  char_name TEXT NOT NULL,
  emotion TEXT NOT NULL,
  variant INTEGER NOT NULL DEFAULT 1,
  lookup_key TEXT NOT NULL,
  image_path TEXT NOT NULL,
  thumb_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER,
  UNIQUE (char_name, emotion, variant)
);
CREATE INDEX IF NOT EXISTS idx_oc_emotes_lookup ON oc_emotes(lookup_key);
CREATE INDEX IF NOT EXISTS idx_oc_emotes_char ON oc_emotes(char_name, emotion, variant);

-- 캐릭터 묶음("조합"). 글에는 저장되지 않는다 — 글쓰기에서 멤버를 한 번에 태그하고,
-- 목록에서 "멤버가 전부 나오는 글" 필터를 거는 용도의 이름표일 뿐이다.
CREATE TABLE IF NOT EXISTS oc_combos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS oc_combo_members (
  combo_id INTEGER NOT NULL REFERENCES oc_combos(id) ON DELETE CASCADE,
  character_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (combo_id, character_name)
);
CREATE INDEX IF NOT EXISTS idx_oc_combo_members_combo ON oc_combo_members(combo_id);
