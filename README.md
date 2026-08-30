<div align="center">

# 🛡️ Obackup (luci-app-obackup) v1.0.4

**Keep your extra packages and their settings when you upgrade OpenWrt**
*نگهداری بسته‌های نصب‌شده و تنظیمات آن‌ها هنگام ارتقای OpenWrt*

[![Release](https://img.shields.io/github/v/release/dreamboxone/obackup?color=blue&style=for-the-badge)](https://github.com/dreamboxone/obackup/releases)
[![OpenWrt](https://img.shields.io/badge/OpenWrt-21.02%20--%2025.12-00C7B7?style=for-the-badge&logo=openwrt&logoColor=white)](https://openwrt.org)
[![Architecture](https://img.shields.io/badge/Architecture-all%20%2F%20noarch-orange?style=for-the-badge)](#)
[![Telegram](https://img.shields.io/badge/Telegram-RouteKernel-2CA5E0?style=for-the-badge&logo=telegram&logoColor=white)](https://t.me/routekernel1)
[![License](https://img.shields.io/badge/License-GPL--3.0-green?style=for-the-badge)](LICENSE)

<br/>

[📖 English](#-english) • [🇮🇷 فارسی](#-فارسی) • [⚡ Install](#-installation)

---

</div>

<a name="english"></a>
## 🇬🇧 English

### What it does

A firmware upgrade keeps your basic OpenWrt settings, but everything you
installed yourself is wiped: **PassWall**, **PassWall 2**, **OpenClash**,
**HomeProxy**, **MosDNS**, custom **Xray / Sing-box / Mihomo** builds, and any
package you added from the OpenWrt package lists.

Obackup saves those packages, the settings that belong to them, their data
directories, and which of their services were switched on. After the upgrade it
puts everything back on its own at the first start.

### How it works

| Step | What happens |
| --- | --- |
| **Backup** | Lists every package that did not come with the firmware, follows their dependencies, downloads the exact package files, and copies their `/etc/config` entries and data directories. |
| **Seal** | Checksums every file in the backup and signs the checksum list with a key that lives only on your router. A backup that was damaged or altered is refused on the way back in. |
| **Restore** | Runs automatically at the first start after the upgrade, once storage is mounted and the internet connection is up. It can also be started by hand from the LuCI page. |

### Upgrading to a different OpenWrt version

Obackup handles a jump such as **21.02 → 25.12**, including the switch from
**OPKG** to **APK**.

* Package files saved on the old firmware were built against its kernel and
  libc, so on a different version they are **not** installed. Packages are
  reinstalled by name from the new system's own package lists instead, and the
  saved files are kept only as a last resort.
* Kernel modules (`kmod-*`) are skipped on a version change — the new firmware
  ships its own matching set.
* Your settings are still restored. Every file that gets replaced is first
  copied next to itself with `.obackup-orig` added to the name, so you can undo
  any single file by hand.
* Custom feed URLs that contain the old release number are pointed at the new
  one, with the original kept as a comment.

### Where the backup is stored

A plugged-in USB drive is preferred; otherwise the router's own storage under
`/etc/obackup_storage`, which is registered in `/etc/sysupgrade.conf` so it
survives the upgrade.

When the backup lives on a mounted drive — a USB stick, or any other disk
mounted under `/mnt` or `/media` — it is also packed into a single
`obackup-bundle-latest.tar.gz`, handy for copying it off the router.

That file is a second copy of everything, so it is **not** written when the
backup sits on the router's own flash at `/etc/obackup_storage`, which is
exactly where space is short.

### It puts itself back too

A sysupgrade removes this package like any other, and after an OPKG to APK
upgrade the saved `.ipk` of it cannot be installed at all. So every backup
carries a copy of Obackup's own files, and the recovery script copies them back
into place. No package manager is involved, because there is nothing to build:
Obackup is shell scripts and one JavaScript file. The LuCI page is there again
at the first start, without you installing anything by hand.

### Extra package feeds

Whatever feeds you added yourself are saved along with their signing keys,
because a feed address without its key is useless to APK.

On an OPKG to APK upgrade the two package managers keep their feeds in
different files and formats, so the old `src/gz` entries are converted into APK
repository URLs, with the release number in the path pointed at the new
release. The original is kept above each one as a comment.

That conversion carries over what the old system had. If a project splits its
feed differently between releases, one address may now be two or three, and the
restore report says so and points at the feed's own instructions.

### Removing a backup

Once the upgrade is done and everything is back, **Delete backup** on the LuCI
page removes the backup and the hook that restores it at boot, and reports how
much space it freed. The signing key is kept, so any copy of a backup you moved
elsewhere can still be verified. From the shell: `obackup delete-backup`.

---

### ⚡ Installation

Download the file that matches your OpenWrt version from the
[releases page](https://github.com/dreamboxone/obackup/releases), then:

**OpenWrt 24.10 and older (OPKG):**
```bash
opkg install /tmp/luci-app-obackup_1.0.4-r1_all.ipk
```

**OpenWrt 25.12 and newer (APK):**
```bash
apk add --allow-untrusted /tmp/luci-app-obackup-1.0.4-r1.apk
```

Then open **LuCI → System → Obackup**.

### Command line

```bash
obackup status        # OpenWrt version, package installer, storage location
obackup list-custom   # packages an upgrade would remove
obackup backup        # run a backup now
obackup restore       # put a backup back now
obackup backup-info   # what is in the stored backup
obackup delete-backup # remove it and free the space
obackup version
```

---

<a name="persian"></a>
## 🇮🇷 فارسی

### این برنامه چه کار می‌کند

هنگام ارتقای فریم‌ور، OpenWrt تنظیمات پایه را نگه می‌دارد اما هر بسته‌ای که
خودتان نصب کرده‌اید پاک می‌شود: **PassWall**، **PassWall 2**، **OpenClash**،
**HomeProxy**، **MosDNS**، نسخه‌های اختصاصی **Xray / Sing-box / Mihomo** و هر
بسته‌ای که از فهرست بسته‌های OpenWrt اضافه کرده‌اید.

Obackup این بسته‌ها، تنظیمات مربوط به آن‌ها، پوشه‌های داده‌شان و وضعیت
روشن یا خاموش بودن سرویس‌هایشان را ذخیره می‌کند و پس از ارتقا، در نخستین
راه‌اندازی همه را خودکار برمی‌گرداند.

### روش کار

| مرحله | توضیح |
| --- | --- |
| **پشتیبان‌گیری** | فهرست بسته‌هایی که همراه فریم‌ور نیامده‌اند تهیه می‌شود، وابستگی‌هایشان دنبال می‌شود، فایل دقیق هر بسته دانلود می‌شود و تنظیمات `/etc/config` و پوشه‌های داده کپی می‌شوند. |
| **مهر و امضا** | از همهٔ فایل‌های پشتیبان checksum گرفته می‌شود و فهرست checksumها با کلیدی که فقط روی همین روتر است امضا می‌شود. پشتیبان دستکاری‌شده یا خراب پذیرفته نمی‌شود. |
| **بازگردانی** | در نخستین راه‌اندازی پس از ارتقا، بعد از آماده شدن حافظه و اتصال اینترنت، خودکار اجرا می‌شود. از صفحهٔ LuCI هم می‌توان دستی اجرا کرد. |

### ارتقا به نسخهٔ دیگر OpenWrt

جابه‌جایی از **21.02 به 25.12** و همچنین تغییر مدیر بسته از **OPKG** به **APK**
پشتیبانی می‌شود.

* فایل بسته‌هایی که روی فریم‌ور قدیمی ذخیره شده‌اند برای کرنل و libc همان نسخه
  ساخته شده‌اند، بنابراین روی نسخهٔ متفاوت **نصب نمی‌شوند**. بسته‌ها با نام،
  از فهرست بسته‌های خودِ سیستم جدید نصب می‌شوند و فایل‌های ذخیره‌شده فقط
  به‌عنوان آخرین راه‌حل به کار می‌روند.
* ماژول‌های کرنل (`kmod-*`) هنگام تغییر نسخه نادیده گرفته می‌شوند، چون فریم‌ور
  جدید نسخهٔ متناسب خودش را دارد.
* تنظیمات شما همچنان بازگردانده می‌شود. از هر فایلی که جایگزین می‌شود ابتدا یک
  کپی با پسوند `.obackup-orig` کنارش ساخته می‌شود تا بتوانید دستی برگردید.
* آدرس فیدهای اختصاصی که شمارهٔ نسخهٔ قدیمی در آن‌ها هست به نسخهٔ جدید تغییر
  می‌کند و آدرس اصلی به‌صورت کامنت نگه داشته می‌شود.

### محل ذخیرهٔ پشتیبان

اگر حافظهٔ USB متصل باشد از آن استفاده می‌شود، در غیر این صورت از حافظهٔ خود
روتر در `/etc/obackup_storage` که در `/etc/sysupgrade.conf` ثبت می‌شود تا از
ارتقا جان سالم به در ببرد.

اگر پشتیبان روی یک حافظهٔ مانت‌شده باشد — فلش USB یا هر دیسک دیگری که زیر
`/mnt` یا `/media` مانت شده — یک فایل فشردهٔ `obackup-bundle-latest.tar.gz` هم
ساخته می‌شود که برای انتقال پشتیبان به جای دیگر مناسب است.

چون این فایل یک نسخهٔ دوم از همه‌چیز است، وقتی پشتیبان روی فلش داخلی روتر در
`/etc/obackup_storage` باشد ساخته **نمی‌شود** — همان‌جایی که کمبود فضا دارید.

### خودش را هم برمی‌گرداند

ارتقای فریم‌ور این بسته را هم مثل بقیه پاک می‌کند، و پس از ارتقای OPKG به APK
فایل `.ipk` ذخیره‌شدهٔ خودش اصلاً قابل نصب نیست. برای همین هر پشتیبان یک کپی از
فایل‌های خود Obackup را با خود دارد و اسکریپت بازیابی آن‌ها را سر جایشان
برمی‌گرداند. هیچ مدیر بسته‌ای درگیر نمی‌شود، چون چیزی برای ساختن وجود ندارد:
Obackup فقط چند اسکریپت شل و یک فایل جاوااسکریپت است. صفحهٔ LuCI در نخستین
راه‌اندازی دوباره در دسترس است، بدون آنکه چیزی نصب کنید.

### فیدهای اختصاصی بسته

فیدهایی که خودتان اضافه کرده‌اید همراه با کلیدهای امضایشان ذخیره می‌شوند، چون
آدرس فید بدون کلیدش برای APK بی‌فایده است.

در ارتقای OPKG به APK، این دو مدیر بسته فیدها را در فایل‌ها و قالب‌های متفاوتی
نگه می‌دارند، بنابراین ورودی‌های `src/gz` قدیمی به آدرس مخزن APK تبدیل می‌شوند و
شمارهٔ نسخه در مسیر به نسخهٔ جدید تغییر می‌کند. آدرس اصلی به‌صورت کامنت بالای هر
خط نگه داشته می‌شود.

این تبدیل همان چیزی را منتقل می‌کند که سیستم قدیمی داشت. اگر پروژه‌ای ساختار
فیدهایش را بین دو نسخه عوض کرده باشد، ممکن است یک آدرس حالا دو یا سه آدرس شده
باشد؛ گزارش بازیابی این را می‌گوید و به راهنمای خود آن پروژه ارجاع می‌دهد.

### حذف پشتیبان

پس از پایان ارتقا و بازگشت همه‌چیز، دکمهٔ **Delete backup** در صفحهٔ LuCI
پشتیبان و قلاب بازیابی هنگام بوت را پاک می‌کند و مقدار فضای آزادشده را
گزارش می‌دهد. کلید امضا نگه داشته می‌شود تا اگر نسخه‌ای از پشتیبان را جای دیگری
کپی کرده‌اید همچنان قابل راستی‌آزمایی باشد. از خط فرمان: `obackup delete-backup`

### نصب

فایل متناسب با نسخهٔ OpenWrt خود را از
[صفحهٔ releases](https://github.com/dreamboxone/obackup/releases) بگیرید:

**OpenWrt 24.10 و قدیمی‌تر (OPKG):**
```bash
opkg install /tmp/luci-app-obackup_1.0.4-r1_all.ipk
```

**OpenWrt 25.12 و جدیدتر (APK):**
```bash
apk add --allow-untrusted /tmp/luci-app-obackup-1.0.4-r1.apk
```

سپس به **LuCI → System → Obackup** بروید.

---

### 👥 ارتباط و پشتیبانی

* 🌐 **GitHub:** [github.com/dreamboxone/obackup](https://github.com/dreamboxone/obackup)
* 📢 **Telegram:** [@routekernel1](https://t.me/routekernel1)

### License

GPL-3.0-only — see [LICENSE](LICENSE).
