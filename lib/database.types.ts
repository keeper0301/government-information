export type WelfareProgram = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  description: string | null;
  eligibility: string | null;
  benefits: string | null;
  apply_method: string | null;
  apply_url: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
  source_url: string | null;
  region: string | null;
  serv_id: string | null;
  detailed_content: string | null;
  selection_criteria: string | null;
  required_documents: string | null;
  contact_info: string | null;
  last_enriched_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export type LoanProgram = {
  id: string;
  title: string;
  category: string;
  target: string | null;
  description: string | null;
  eligibility: string | null;
  loan_amount: string | null;
  interest_rate: string | null;
  repayment_period: string | null;
  apply_method: string | null;
  apply_url: string | null;
  apply_start: string | null;
  apply_end: string | null;
  source: string;
  source_url: string | null;
  detailed_content: string | null;
  required_documents: string | null;
  contact_info: string | null;
  last_enriched_at: string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
};

export type AlarmSubscription = {
  id: string;
  user_id: string;
  email: string;
  program_type: "welfare" | "loan";
  program_id: string;
  notify_before_days: number;
  is_active: boolean;
  created_at: string;
};

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  content: string;
  meta_description: string | null;
  tags: string[] | null;
  view_count: number;
  published_at: string | null;
  created_at: string;
};

export type UserProfile = {
  id: string;
  age_group: string | null;
  region: string | null;
  occupation: string | null;
  interests: string[] | null;
  created_at: string;
};
