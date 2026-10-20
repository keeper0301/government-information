import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({from:vi.fn(),generate:vi.fn(),review:vi.fn(),wp:vi.fn(),naver:vi.fn(),insert:vi.fn(),update:vi.fn(),saveResult:{data:[{id:"post"}] as {id:string}[],error:null as null | {message:string}}}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:m.from})}));
vi.mock("@/lib/ai",()=>({generateBlogPost:m.generate,detectDescriptionCopy:()=>null,detectMetaCopy:()=>null}));
vi.mock("@/lib/html-sanitize",()=>({sanitizeBlogHtml:async(s:string)=>s}));
vi.mock("@/lib/blog/quality-learning",()=>({getRecentQualityImprovementHints:async()=>[]}));
vi.mock("@/lib/blog/trend-learning",()=>({getRecentBlogTrendHints:async()=>[]}));
vi.mock("@/lib/blog/external-channel-learning",()=>({getRecentExternalChannelLearningHints:async()=>[]}));
vi.mock("@/lib/blog/quality-check",()=>({evaluateBlogQuality:m.review,isTransientQualityReviewFailure:()=>false}));
vi.mock("@/lib/wordpress/publisher",()=>({publishToWordPress:m.wp}));
vi.mock("@/lib/naver-blog/queue",()=>({enqueueNaverBlog:m.naver}));
vi.mock("@/lib/admin-actions",()=>({logAdminAction:async()=>{}}));
import {publishOnePost} from "@/lib/blog-publish";

describe("draft -> review -> durable approval -> external publication",()=>{
 beforeEach(()=>{
  vi.clearAllMocks();
  m.saveResult={data:[{id:"post"}],error:null};
  m.generate.mockResolvedValue({title:"2026년 청년 월세 지원 신청 안내",content:"가".repeat(2100),meta_description:"나".repeat(100),tags:[],faqs:[],category:"청년"});
  m.review.mockImplementation(async()=>{
   expect(m.insert.mock.calls[0][0]).toMatchObject({published_at:null,admin_review_required:true,admin_reviewed_at:null});
   expect(m.wp).not.toHaveBeenCalled();expect(m.naver).not.toHaveBeenCalled();
   return {score:4,needsReview:false,reason:"OK",improvements:[]};
  });
  m.wp.mockResolvedValue({ok:true,wpPostUrl:"https://example.invalid/post",wpPostId:1});
  m.from.mockImplementation((table:string)=>{
   let updating=false;
   const q={
    select:vi.fn(()=>q),not:vi.fn(()=>q),is:vi.fn(()=>q),eq:vi.fn(()=>q),or:vi.fn(()=>q),order:vi.fn(()=>q),
    range:vi.fn(async()=>({data:table==="welfare_programs"?[{id:"program",title:"청년 월세",description:"설명",category:"청년"}]:[],error:null})),
    insert:vi.fn((row:unknown)=>{m.insert(row);return q;}),
    update:vi.fn((row:unknown)=>{updating=true;m.update(row);return q;}),
    single:vi.fn(async()=>({data:{id:"post"},error:null})),
    then:(resolve:(v:unknown)=>unknown)=>Promise.resolve(updating?m.saveResult:{data:[],error:null}).then(resolve),
   };return q;
  });
 });
 it("stores only a draft until review succeeds, then publishes",async()=>{
  const result=await publishOnePost({category:"청년"});
  expect(m.update.mock.calls[0][0]).toMatchObject({admin_review_required:false,published_at:expect.any(String)});
  expect(result.externalPublishHeld).toBe(false);expect(m.wp).toHaveBeenCalledOnce();expect(m.naver).toHaveBeenCalledOnce();
 });
 it.each(["low-score","placeholder","db-error","zero-rows","review-throw"])("never releases on %s",async(mode)=>{
  if(mode==="low-score")m.review.mockResolvedValue({score:2,needsReview:true,reason:"bad",improvements:[]});
  if(mode==="placeholder")m.generate.mockResolvedValue({...await m.generate(),meta_description:"나".repeat(96)+"N만원"});
  if(mode==="db-error")m.saveResult={data:[],error:{message:"fixture failure"}};
  if(mode==="zero-rows")m.saveResult={data:[],error:null};
  if(mode==="review-throw")m.review.mockRejectedValue(new Error("fixture crash"));
  const result=mode==="review-throw"
    ? await publishOnePost({category:"청년"}).then(()=>{throw new Error("expected rejection");},error=>{expect(error.message).toBe("fixture crash");return null;})
    : await publishOnePost({category:"청년"});
  if(result)expect(result.externalPublishHeld).toBe(true);
  expect(m.wp).not.toHaveBeenCalled();expect(m.naver).not.toHaveBeenCalled();
  expect(m.insert.mock.calls[0][0].published_at).toBe(null);
 });
});
