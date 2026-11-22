package com.keepioo.app;

import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import androidx.appcompat.app.AlertDialog;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.Map;

public class MainActivity extends BridgeActivity {
    private static final String SITE = "https://www.keepioo.com";
    private SharedPreferences savedPolicies;
    private WebView website;
    private Button saveButton;
    private NewsBanner newsBanner;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        if (getBridge() == null) return;
        savedPolicies = getSharedPreferences("saved_policies", MODE_PRIVATE);
        website = getBridge().getWebView();
        installNavigation();
        getBridge().setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean reload) {
                super.doUpdateVisitedHistory(view, url, reload);
                updateSaveButton(url);
                newsBanner.update(url);
            }
        });
        updateSaveButton(website.getUrl());
        newsBanner.update(website.getUrl());
    }

    // 기존 웹뷰와 하단 메뉴를 별도 영역에 두어 본문을 가리지 않습니다.
    private void installNavigation() {
        ViewGroup content = findViewById(android.R.id.content);
        View existing = content.getChildAt(0);
        content.removeView(existing);
        LinearLayout column = new LinearLayout(this);
        column.setOrientation(LinearLayout.VERTICAL);
        content.addView(column, new ViewGroup.LayoutParams(-1, -1));
        column.addView(existing, new LinearLayout.LayoutParams(-1, 0, 1));

        saveButton = new Button(this);
        saveButton.setOnClickListener(view -> togglePolicy());
        column.addView(saveButton, new LinearLayout.LayoutParams(-1, -2));

        LinearLayout adSpace = new LinearLayout(this);
        adSpace.setGravity(android.view.Gravity.CENTER);
        adSpace.setVisibility(View.GONE);
        column.addView(adSpace, new LinearLayout.LayoutParams(-1, -2));
        newsBanner = new NewsBanner(this, adSpace);

        LinearLayout navigation = new LinearLayout(this);
        column.addView(navigation, new LinearLayout.LayoutParams(-1, -2));
        // 화면 가장자리까지 그리는 기기에서 시스템 버튼이 앱 메뉴를 가리지 않게 합니다.
        androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(navigation, (view, insets) -> {
            var systemBars = insets.getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars()
                | androidx.core.view.WindowInsetsCompat.Type.displayCutout());
            view.setPadding(systemBars.left, 0, systemBars.right, systemBars.bottom);
            return insets;
        });
        androidx.core.view.ViewCompat.requestApplyInsets(navigation);
        addTab(navigation, "홈", () -> website.loadUrl(SITE));
        addTab(navigation, "정책 찾기", () -> website.loadUrl(SITE + "/welfare"));
        addTab(navigation, "정책뉴스", () -> website.loadUrl(SITE + "/news"));
        addTab(navigation, "저장", this::showSavedPolicies);
    }

    @Override
    public void onDestroy() {
        if (newsBanner != null) newsBanner.close();
        super.onDestroy();
    }

    private void addTab(LinearLayout row, String label, Runnable action) {
        Button tab = new Button(this, null, android.R.attr.borderlessButtonStyle);
        tab.setText(label);
        tab.setPadding(0, 0, 0, 0);
        tab.setMinimumWidth(0);
        tab.setMinWidth(0);
        tab.setOnClickListener(view -> action.run());
        row.addView(tab, new LinearLayout.LayoutParams(0, -2, 1));
    }

    // 키피오의 정책 상세 주소만 저장하고 검색 조건과 추적 값은 제거합니다.
    private String policyAddress(String address) {
        if (address == null) return null;
        Uri uri = Uri.parse(address);
        String path = uri.getPath();
        if (!"https".equals(uri.getScheme())
            || !("www.keepioo.com".equals(uri.getHost()) || "keepioo.com".equals(uri.getHost()))
            || uri.getUserInfo() != null || uri.getPort() != -1 || path == null
            || !path.matches("/(?:welfare|policy|loan)/[A-Za-z0-9._-]+/?")) return null;
        if (path.endsWith("/")) path = path.substring(0, path.length() - 1);
        if (path.endsWith("/.") || path.endsWith("/..")) return null;
        return SITE + path;
    }

    private void updateSaveButton(String address) {
        String policy = policyAddress(address);
        saveButton.setVisibility(policy == null ? View.GONE : View.VISIBLE);
        if (policy != null) saveButton.setText(savedPolicies.contains(policy) ? "저장 해제" : "이 정책 저장");
    }

    private void togglePolicy() {
        String policy = policyAddress(website.getUrl());
        if (policy == null) return;
        if (savedPolicies.contains(policy)) {
            savedPolicies.edit().remove(policy).apply();
        } else {
            String title = website.getTitle();
            savedPolicies.edit().putString(policy, title == null || title.trim().isEmpty() ? policy : title).apply();
        }
        updateSaveButton(policy);
    }

    private void showSavedPolicies() {
        ArrayList<Map.Entry<String, ?>> entries = new ArrayList<>(savedPolicies.getAll().entrySet());
        entries.removeIf(entry -> policyAddress(entry.getKey()) == null || !(entry.getValue() instanceof String));
        entries.sort(Comparator.comparing(entry -> entry.getValue().toString()));
        AlertDialog.Builder dialog = new AlertDialog.Builder(this).setTitle("저장한 정책").setNegativeButton("닫기", null);
        if (entries.isEmpty()) {
            dialog.setMessage("정책 상세에서 ‘이 정책 저장’을 누르면 여기에 표시됩니다.");
        } else {
            CharSequence[] titles = entries.stream().map(entry -> entry.getValue().toString()).toArray(CharSequence[]::new);
            dialog.setItems(titles, (window, index) -> website.loadUrl(entries.get(index).getKey()));
        }
        dialog.show();
    }
}
