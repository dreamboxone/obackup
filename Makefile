include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-obackup
PKG_VERSION:=1.0.3
PKG_RELEASE:=1
PKG_MAINTAINER:=dreamboxone <https://github.com/dreamboxone/obackup>
PKG_LICENSE:=GPL-3.0-only

# Deliberately built as a plain OpenWrt package instead of via feeds/luci/luci.mk.
# luci.mk redefines Package/$(PKG_NAME)/install after we set it, and it only
# exists when the luci feed happens to be checked out, which is not guaranteed
# inside the SDK container used by CI.
include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=Carry your extra packages and settings across OpenWrt upgrades
  PKGARCH:=all
  DEPENDS:=+luci-base +rpcd +jshn +usign +tar +block-mount +uci
endef

define Package/$(PKG_NAME)/description
 Obackup saves the packages you installed yourself, their configuration files
 and which of their services were enabled, then puts everything back after a
 sysupgrade. It also handles upgrades that jump between OpenWrt releases
 (21.02 through 25.12) and between the opkg and apk package managers.
endef

# Nothing is compiled: the package ships shell scripts and a LuCI view.
define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
endef

define Build/Configure
endef

define Build/Compile
endef

define Package/$(PKG_NAME)/install
	$(INSTALL_DIR) $(1)/usr/bin
	$(INSTALL_BIN) ./root/usr/bin/obackup $(1)/usr/bin/obackup

	$(INSTALL_DIR) $(1)/usr/libexec/rpcd
	$(INSTALL_BIN) ./root/usr/libexec/rpcd/obackup $(1)/usr/libexec/rpcd/obackup

	$(INSTALL_DIR) $(1)/etc/uci-defaults
	$(INSTALL_BIN) ./root/etc/uci-defaults/99-obackup-init $(1)/etc/uci-defaults/99-obackup-init

	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/luci-app-obackup.json $(1)/usr/share/luci/menu.d/luci-app-obackup.json

	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/luci-app-obackup.json $(1)/usr/share/rpcd/acl.d/luci-app-obackup.json

	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/obackup
	$(INSTALL_DATA) ./root/www/luci-static/resources/view/obackup/main.js $(1)/www/luci-static/resources/view/obackup/main.js
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
# apk on OpenWrt 25.12 runs maintainer scripts under "set -e", so every command
# here must either succeed or be guarded.
if [ -z "$${IPKG_INSTROOT}" ]; then
	rm -f /tmp/luci-indexcache /tmp/luci-indexcache.* 2>/dev/null || true
	rm -rf /tmp/luci-modulecache 2>/dev/null || true
fi
exit 0
endef

define Package/$(PKG_NAME)/postrm
#!/bin/sh
rm -f /tmp/luci-indexcache /tmp/luci-indexcache.* 2>/dev/null || true
rm -rf /tmp/luci-modulecache 2>/dev/null || true
exit 0
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
