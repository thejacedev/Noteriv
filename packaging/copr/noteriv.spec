# Noteriv RPM for COPR.
#
# This repackages the prebuilt upstream .deb (the same artifact the Flatpak
# uses) into an RPM. COPR allows this; official Fedora does not. To bump:
#   1. set Version below to a PUBLISHED release tag (the v%{version} .deb must exist)
#   2. rebuild the SRPM and upload to COPR (see README notes at bottom)

Name:           noteriv
Version:        2.1.1
Release:        1%{?dist}
Summary:        Modern markdown editor with plugins, themes, and sync

License:        MIT
URL:            https://github.com/thejacedev/Noteriv
Source0:        https://github.com/thejacedev/Noteriv/releases/download/v%{version}/Noteriv_%{version}_amd64.deb

# Only an x86_64 .deb is published upstream.
ExclusiveArch:  x86_64

# Tools to unpack the .deb in %prep.
BuildRequires:  binutils
BuildRequires:  tar
BuildRequires:  gzip

# The binary's shared-library deps (libwebkit2gtk, gtk3, ...) are detected
# automatically from the ELF; these are listed for clarity / early failure.
Requires:       webkit2gtk4.1
Requires:       gtk3

# We ship a prebuilt, already-stripped binary — disable debuginfo extraction
# and the build-id/strip machinery that expects we compiled it ourselves.
%global debug_package %{nil}
%global __strip /bin/true
%global _missing_build_ids_terminate_build 0

%description
Noteriv is a modern markdown editor with a plugin API, themes, and
Git/WebDAV sync. It features a live markdown editor with wiki-links and
backlinks, multi-vault support, a graph view, kanban board, daily notes,
tags, and full-text search.

%prep
# A .deb is an 'ar' archive containing data.tar.gz with the file tree.
ar x %{SOURCE0}
tar -xf data.tar.gz

%build
# Nothing to build: the upstream binary is prebuilt.

%install
# The unpacked tree mirrors the final layout (usr/bin, usr/share/...).
cp -a usr %{buildroot}/

%files
%{_bindir}/noteriv
%{_datadir}/applications/Noteriv.desktop
%{_datadir}/icons/hicolor/*/apps/noteriv.png

%changelog
* Sat May 30 2026 Jace Sleeman <jace@noteriv.com> - 2.1.1-1
- Repackage upstream v2.1.1 .deb

* Sat May 30 2026 Jace Sleeman <jace@noteriv.com> - 2.1.0-1
- Initial COPR package (repackaged upstream .deb)
