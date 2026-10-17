import { beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactNode } from "react";
const state = vi.hoisted(() => ({row:{} as Record<string,unknown>, readError:null as unknown, saved:[{id:"1"}] as {id:string}[], error:null as unknown, update:vi.fn(), eq:vi.fn(), audit:vi.fn(), review:vi.fn()}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:"admin",email:"local@test.invalid"}}})}})}));
vi.mock("@/lib/admin-auth",()=>({isAdminUser:()=>true}));
vi.mock("@/lib/admin-actions",()=>({logAdminAction:state.audit}));
vi.mock("next/navigation",()=>({redirect:(url:string)=>{throw new Error(url);},notFound:()=>{throw new Error("404");}}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/html-sanitize",()=>({sanitizeBlogHtml:async(s:string)=>s}));
vi.mock("@/lib/blog/quality-check",()=>({evaluateBlogQuality:state.review,isTransientQualityReviewFailure:()=>false}));
vi.mock("@/app/admin/blog/[id]/rich-editor",()=>({RichEditor:()=>null}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:()=>({from:()=>{
 let writing=false;
 const q={select:()=>writing?Promise.resolve({data:state.saved,error:state.error}):q,
  eq:(...args:unknown[])=>{state.eq(...args);return q;},maybeSingle:async()=>({data:state.row,error:state.readError}),
  update:(patch:unknown)=>{writing=true;state.update(patch);return q;}};
 return q;
}})}));
import Page from "@/app/admin/blog/[id]/page";
function actions(node:ReactNode): ((data:FormData)=>Promise<void>)[] {
 if(Array.isArray(node))return node.flatMap(actions);
 if(!isValidElement<{children?:ReactNode;action?:unknown}>(node))return [];
 return [...(typeof node.props.action==="function"?[node.props.action as (data:FormData)=>Promise<void>]:[]),...actions(node.props.children)];
}
async function action(name:string){const tree=await Page({params:Promise.resolve({id:"1"}),searchParams:Promise.resolve({})});const found=actions(tree).find(fn=>fn.name===name);expect(found).toBeDefined();return found!;}
function form(){const data=new FormData();data.set("title","200만원");data.set("content","본문");return data;}
describe("admin publication and save DB boundaries",()=>{
 beforeEach(()=>{state.row={id:"1",slug:"test",title:"100만원",content:"본문",meta_description:null,tags:[],faqs:[],category:null,cover_image:null,published_at:"2026-01-01",updated_at:"v1",admin_review_required:false,admin_review_score:null,admin_reviewed_at:null};state.readError=null;state.error=null;state.saved=[{id:"1"}];state.update.mockReset();state.eq.mockReset();state.audit.mockReset();state.review.mockReset().mockResolvedValue({score:4,needsReview:false,reason:"OK",improvements:[]});});
 it.each([null,{message:"DB failed"}])("does not report successful save for zero-row/error update %j",async error=>{const save=await action("saveBlogPost");state.saved=[];state.error=error;await expect(save(form())).rejects.toThrow("save_failed_or_stale");expect(state.audit).not.toHaveBeenCalled();expect(state.eq).toHaveBeenCalledWith("updated_at","v1");expect(state.update.mock.calls[0][0]).not.toHaveProperty("published_at");});
 it("does not write after latest read error",async()=>{const save=await action("saveBlogPost");state.readError={message:"DB failed"};await expect(save(form())).rejects.toThrow("read_failed");expect(state.update).not.toHaveBeenCalled();});
 it("does not write rejected replacement",async()=>{const save=await action("saveBlogPost");state.review.mockResolvedValue({score:2,needsReview:true});await expect(save(form())).rejects.toThrow("error=");expect(state.update).not.toHaveBeenCalled();});
 it("rejects a stale rendered form before review",async()=>{const save=await action("saveBlogPost");state.row={...state.row,updated_at:"v2"};await expect(save(form())).rejects.toThrow("error=");expect(state.review).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();});
 it("does not publish an unreviewed legacy-shaped draft",async()=>{state.row.published_at=null;const publish=await action("togglePublish");await expect(publish(new FormData())).rejects.toThrow("quality_not_approved");expect(state.update).not.toHaveBeenCalled();});
 it("publishes reviewed numeric draft using CAS",async()=>{state.row.published_at=null;state.row.admin_reviewed_at="2026-01-01";const publish=await action("togglePublish");await expect(publish(new FormData())).rejects.toThrow("saved=1");expect(state.update.mock.calls[0][0].published_at).toBeTruthy();expect(state.eq).toHaveBeenCalledWith("updated_at","v1");});
 it("cannot manually approve a placeholder",async()=>{state.row.title="N만원";state.row.admin_review_required=true;const approve=await action("approveExternalQuality");await expect(approve(new FormData())).rejects.toThrow("quality_not_approved");expect(state.update).not.toHaveBeenCalled();});
});
