package com.keepioo.app;

import android.net.Uri;
import android.view.View;
import android.widget.LinearLayout;
import com.google.android.gms.ads.AdListener;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

// 시험 빌드는 구글이 제공하는 시험 배너만 요청합니다.
final class NewsBanner {
    private final MainActivity activity;
    private final LinearLayout space;
    private AdView ad;
    private boolean inNews;
    private boolean requestedConsent;
    private boolean ready;
    private boolean closed;

    NewsBanner(MainActivity activity, LinearLayout space) {
        this.activity = activity;
        this.space = space;
    }

    void update(String address) {
        Uri uri = address == null ? null : Uri.parse(address);
        inNews = uri != null && "https".equals(uri.getScheme())
            && "www.keepioo.com".equals(uri.getHost())
            && "/news".equals(uri.getPath()) && uri.getQuery() == null;
        if (!inNews) {
            clear();
            return;
        }
        if (ready) {
            show();
        } else if (!requestedConsent) {
            requestedConsent = true;
            var consent = UserMessagingPlatform.getConsentInformation(activity);
            Runnable initialize = () -> {
                if (closed || !consent.canRequestAds()) return;
                new Thread(() -> MobileAds.initialize(activity, status -> activity.runOnUiThread(() -> {
                    if (closed) return;
                    ready = true;
                    show();
                }))).start();
            };
            consent.requestConsentInfoUpdate(activity, new ConsentRequestParameters.Builder().build(),
                () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, error -> initialize.run()),
                error -> initialize.run());
        }
    }

    private void show() {
        if (closed || !inNews || ad != null) return;
        int pixels = space.getParent() instanceof View ? ((View) space.getParent()).getWidth() : 0;
        if (pixels <= 0) {
            space.post(() -> {
                if (space.getParent() instanceof View && ((View) space.getParent()).getWidth() > 0) show();
            });
            return;
        }
        int width = (int) (pixels / activity.getResources().getDisplayMetrics().density);
        AdView candidate = new AdView(activity);
        ad = candidate;
        candidate.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, width));
        candidate.setAdUnitId("ca-app-pub-3940256099942544/9214589741");
        candidate.setAdListener(new AdListener() {
            @Override public void onAdLoaded() {
                if (ad == candidate && inNews) space.setVisibility(View.VISIBLE);
            }

            @Override public void onAdFailedToLoad(LoadAdError error) {
                if (ad == candidate) clear();
            }
        });
        space.addView(candidate);
        candidate.loadAd(new AdRequest.Builder().build());
    }

    private void clear() {
        space.setVisibility(View.GONE);
        space.removeAllViews();
        if (ad != null) {
            ad.destroy();
            ad = null;
        }
    }

    void close() {
        closed = true;
        clear();
    }
}
