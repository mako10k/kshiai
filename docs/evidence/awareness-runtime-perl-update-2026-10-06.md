# PR158 runtime OSライブラリ更新

PR158初回CI [37392123256](https://github.com/mako10k/kshiai/actions/runs/37392123256) のbackend-image job [112039406796](https://github.com/mako10k/kshiai/actions/runs/37392123256/job/112039406796) はbuildとcompiled API importに成功し、Trivy scanで失敗した。最終イメージのperl-base5.36.0-7+deb12u3にHIGH4/CRITICAL3、fixed5.36.0-7+deb12u4の検出があった。アプリのSSE処理が失敗した証拠ではない。

[Debian公式security tracker](https://security-tracker.debian.org/tracker/CVE-2026-13221) と[公式package index](https://security.debian.org/debian-security/dists/bookworm-security/main/binary-amd64/Packages.xz) はbookworm-securityの修正版5.36.0-7+deb12u4を示す。2026-10-06にindexを読取り、perl-baseのversionと配布SHA256 d7d1943aec9597629bf73075efcc5ef6dc9bda96d78e80d843156ecd448478b8を確認した。

Dockerfile runtimeのapt upgrade対象は従来libpcre2だけで、perl-baseはベースイメージの導入版を保持していた。対象にperl-baseを加え、dpkgで修正版本以上を確認する。Node22/Debian12・workspace配置・非rootユーザー・起動コマンドは維持する。Trivy基準・severity・ignore policyは変更しない。以前のscanで未検出だった正確な差（baseとscanner DBのどちらが変わったか）は未確定。

新しい実イメージbuild/import/scanのCI成功を完了証拠とする。ローカルDocker daemonは利用できず、ローカルで実イメージ起動済みとはしない。CLI llmthink auditはfatal/error/warning0。
