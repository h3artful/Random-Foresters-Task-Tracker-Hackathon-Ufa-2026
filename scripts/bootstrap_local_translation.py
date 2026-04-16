from __future__ import annotations

import os
from pathlib import Path


def configure_argos_paths(project_root: Path) -> tuple[Path, Path, Path]:
    argos_root = project_root / ".argos"
    data_home = argos_root / "data"
    cache_home = argos_root / "cache"
    config_home = argos_root / "config"

    data_home.mkdir(parents=True, exist_ok=True)
    cache_home.mkdir(parents=True, exist_ok=True)
    config_home.mkdir(parents=True, exist_ok=True)

    os.environ["XDG_DATA_HOME"] = str(data_home)
    os.environ["XDG_CACHE_HOME"] = str(cache_home)
    os.environ["XDG_CONFIG_HOME"] = str(config_home)
    os.environ["ARGOS_PACKAGES_DIR"] = str(data_home / "argos-translate" / "packages")
    os.environ["ARGOS_CHUNK_TYPE"] = "MINISBD"

    return data_home, cache_home, config_home


def install_ru_en_argos_package() -> None:
    import argostranslate.package

    argostranslate.package.update_package_index()
    available_packages = argostranslate.package.get_available_packages()
    ru_en_packages = [pkg for pkg in available_packages if pkg.from_code == "ru" and pkg.to_code == "en"]
    if not ru_en_packages:
        raise RuntimeError("Argos package ru->en not found in package index")

    package = ru_en_packages[0]
    downloaded_path = package.download()
    argostranslate.package.install_from_path(downloaded_path)



def preload_minisbd_ru_model(cache_home: Path) -> None:
    import minisbd.models

    minisbd_cache_dir = cache_home / "minisbd"
    minisbd_cache_dir.mkdir(parents=True, exist_ok=True)
    minisbd.models.cache_dir = str(minisbd_cache_dir)
    minisbd.models.get_model_file("ru")



def validate_translation() -> str:
    import argostranslate.translate

    languages = argostranslate.translate.get_installed_languages()
    from_lang = next((lang for lang in languages if lang.code == "ru"), None)
    to_lang = next((lang for lang in languages if lang.code == "en"), None)
    if from_lang is None or to_lang is None:
        raise RuntimeError("ru/en language pair is not installed")

    translation = from_lang.get_translation(to_lang)
    if translation is None:
        raise RuntimeError("ru->en translation is unavailable")

    return translation.translate("Починить кнопку в профиле")



def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    _, cache_home, _ = configure_argos_paths(project_root)

    install_ru_en_argos_package()
    preload_minisbd_ru_model(cache_home)

    sample = validate_translation()
    print("Local translation bootstrap completed.")
    print(f"Sample: {sample}")


if __name__ == "__main__":
    main()
