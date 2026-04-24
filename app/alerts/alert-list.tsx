"use client";

import { useState, useEffect } from "react";
import type { AlarmSubscription } from "@/lib/database.types";
import { calcDday } from "@/lib/utils";

// 프로그램 정보 타입
type ProgramInfo = { title: string; apply_end: string | null };

export function AlertList() {
  const [subscriptions, setSubscriptions] = useState<AlarmSubscription[]>([]);
  const [programs, setPrograms] = useState<Record<string, ProgramInfo>>({});
  const [loading, setLoading] = useState(true);

  // 알림 목록 불러오기
  useEffect(() => {
    fetchAlerts();
  }, []);

  async function fetchAlerts() {
    setLoading(true);
    try {
      const res = await fetch("/api/alarm");
      const data = await res.json();
      setSubscriptions(data.subscriptions || []);
      setPrograms(data.programs || {});
    } catch {
      setSubscriptions([]);
    } finally {
      setLoading(false);
    }
  }

  // 알림 해제 함수
  async function handleDeactivate(subscriptionId: string) {
    try {
      await fetch("/api/alarm", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId }),
      });
      // 목록에서 해당 항목의 is_active를 false로 변경
      setSubscriptions((prev) =>
        prev.map((s) =>
          s.id === subscriptionId ? { ...s, is_active: false } : s
        )
      );
    } catch {
      // 실패 시 아무것도 안 함
    }
  }

  if (loading) {
    return (
      <div className="text-center py-16 text-grey-600 text-[15px]">
        불러오는 중...
      </div>
    );
  }

  // 활성/비활성 분리
  const activeAlerts = subscriptions.filter((s) => s.is_active);
  const inactiveAlerts = subscriptions.filter((s) => !s.is_active);

  if (subscriptions.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="text-[48px] mb-4">📭</div>
        <p className="text-[15px] text-grey-600">
          등록된 알림이 없습니다. 정책 상세 페이지에서 알림을 등록해보세요.
        </p>
      </div>
    );
  }

  return (
    <div>
      {/* 활성 알림 */}
      {activeAlerts.length > 0 && (
        <div className="mb-10">
          <h2 className="text-[17px] font-bold text-grey-900 mb-4">
            활성 알림 ({activeAlerts.length}건)
          </h2>
          <div className="space-y-3">
            {activeAlerts.map((sub) => {
              const program = programs[sub.program_id];
              const dday = program?.apply_end ? calcDday(program.apply_end) : null;

              return (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-4 bg-white border border-grey-100 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[15px] font-semibold text-grey-900 truncate">
                        {program?.title || "프로그램 정보 없음"}
                      </span>
                      {dday !== null && (
                        <span
                          className={`shrink-0 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                            dday <= 7
                              ? "bg-[#FFEEEE] text-red"
                              : "bg-blue-50 text-blue-600"
                          }`}
                        >
                          D-{dday}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] text-grey-600">
                      {sub.program_type === "welfare" ? "복지" : "대출"} · 마감{" "}
                      {sub.notify_before_days}일 전 알림 ·{" "}
                      {program?.apply_end || "상시"}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeactivate(sub.id)}
                    className="shrink-0 ml-4 px-3 py-1.5 text-[13px] font-medium text-grey-600 bg-grey-100 rounded-lg border-none cursor-pointer hover:bg-grey-200 transition-colors"
                  >
                    해제
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 비활성 알림 */}
      {inactiveAlerts.length > 0 && (
        <div>
          <h2 className="text-[17px] font-bold text-grey-600 mb-4">
            해제된 알림 ({inactiveAlerts.length}건)
          </h2>
          <div className="space-y-3 opacity-60">
            {inactiveAlerts.map((sub) => {
              const program = programs[sub.program_id];
              return (
                <div
                  key={sub.id}
                  className="flex items-center justify-between p-4 bg-grey-50 border border-grey-100 rounded-xl"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[15px] text-grey-600 truncate">
                      {program?.title || "프로그램 정보 없음"}
                    </span>
                    <div className="text-[13px] text-grey-500 mt-1">
                      {sub.program_type === "welfare" ? "복지" : "대출"} · 해제됨
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
