import {beforeEach,describe,expect,it,vi} from "vitest";
const m=vi.hoisted(()=>({read:vi.fn(),insert:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>({select:()=>({eq:()=>({maybeSingle:m.read})}),insert:m.insert})})}));
import {enqueueNaverBlog} from "@/lib/naver-blog/queue";
describe("Naver enqueue eligibility",()=>{
 const good={title:"100만원",content:"본문",published_at:"2026-10-13",admin_review_required:false,admin_reviewed_at:"2026-10-13"};
 beforeEach(()=>{vi.clearAllMocks();m.read.mockResolvedValue({data:good,error:null});m.insert.mockResolvedValue({error:null});});
 it("enqueues an approved published post",async()=>{expect(await enqueueNaverBlog("fixture")).toBe(true);expect(m.insert).toHaveBeenCalledOnce();});
 it.each([{published_at:null},{admin_reviewed_at:null},{admin_review_required:true},{title:"N만원"},{tags:["N만 원"]},{faqs:[{answer:"N만원"}]}])("holds %j before inserting",async override=>{
  m.read.mockResolvedValue({data:{...good,...override},error:null});
  expect(await enqueueNaverBlog("fixture")).toBe(false);expect(m.insert).not.toHaveBeenCalled();
 });
 it("holds database read failure",async()=>{m.read.mockResolvedValue({data:null,error:{message:"fixture"}});expect(await enqueueNaverBlog("fixture")).toBe(false);expect(m.insert).not.toHaveBeenCalled();});
 it("preserves duplicate protection",async()=>{m.insert.mockResolvedValue({error:{code:"23505"}});expect(await enqueueNaverBlog("fixture")).toBe(false);});
});
