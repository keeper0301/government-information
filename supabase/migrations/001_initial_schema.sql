-- 복지 프로그램
CREATE TABLE IF NOT EXISTS welfare_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  target TEXT,
  description TEXT,
  eligibility TEXT,
  benefits TEXT,
  apply_method TEXT,
  apply_url TEXT,
  apply_start DATE,
  apply_end DATE,
  source TEXT NOT NULL,
  source_url TEXT,
  region TEXT,
  view_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 소상공인 대출/지원
CREATE TABLE IF NOT EXISTS loan_programs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  target TEXT,
  description TEXT,
  eligibility TEXT,
  loan_amount TEXT,
  interest_rate TEXT,
  repayment_period TEXT,
  apply_method TEXT,
  apply_url TEXT,
  apply_start DATE,
  apply_end DATE,
  source TEXT NOT NULL,
  source_url TEXT,
  view_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 이메일 알람 구독
CREATE TABLE IF NOT EXISTS alarm_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  program_type TEXT NOT NULL CHECK (program_type IN ('welfare', 'loan')),
  program_id UUID NOT NULL,
  notify_before_days INT DEFAULT 7,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 블로그
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  meta_description TEXT,
  tags TEXT[],
  view_count INT DEFAULT 0,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 사용자 프로필
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  age_group TEXT,
  region TEXT,
  occupation TEXT,
  interests TEXT[],
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS 활성화
ALTER TABLE welfare_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE loan_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarm_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- 읽기는 모두 공개
CREATE POLICY "welfare_programs_read" ON welfare_programs FOR SELECT USING (true);
CREATE POLICY "loan_programs_read" ON loan_programs FOR SELECT USING (true);
CREATE POLICY "blog_posts_read" ON blog_posts FOR SELECT USING (true);

-- 알람: 본인 것만
CREATE POLICY "alarm_own_read" ON alarm_subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "alarm_own_insert" ON alarm_subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "alarm_own_delete" ON alarm_subscriptions FOR DELETE USING (auth.uid() = user_id);

-- 프로필: 본인 것만
CREATE POLICY "profile_own_read" ON user_profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "profile_own_upsert" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profile_own_update" ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_welfare_category ON welfare_programs(category);
CREATE INDEX IF NOT EXISTS idx_welfare_region ON welfare_programs(region);
CREATE INDEX IF NOT EXISTS idx_welfare_apply_end ON welfare_programs(apply_end);
CREATE INDEX IF NOT EXISTS idx_loan_category ON loan_programs(category);
CREATE INDEX IF NOT EXISTS idx_loan_apply_end ON loan_programs(apply_end);
CREATE INDEX IF NOT EXISTS idx_alarm_user ON alarm_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_blog_slug ON blog_posts(slug);
CREATE INDEX IF NOT EXISTS idx_blog_published ON blog_posts(published_at);
