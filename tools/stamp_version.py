#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""プログラムのファイルの呼び名に版の番号（?v=番号）を付ける道具（段階6-22b）。

実行: app/ から  python3 tools/stamp_version.py           番号を付け直す
                 python3 tools/stamp_version.py --check   付け忘れ・付け違いがないかだけを確かめる

ブラウザは、前に読んだプログラムのファイルを覚えていて使い回すことがある。古いファイルと新しいファイルが
混ざると、新しいファイルにしか無い部品が見つからずに止まる。呼び名に番号を付けると、番号が変われば
ブラウザは別のファイルとして必ず新しく読む。

- 番号：index.html、js/ の .js、css/ の .css、settings.json、data/ の .json の中身から計算する
  （SHA-256 の先頭10文字）。付けてある番号の部分を取り除いた中身を、名前の順に使うので、
  中身が同じなら何度動かしても、どのPCでも同じ番号になる。
- 付ける場所：index.html の js/main.js・css/style.css、js/ の .js の中の ./・../ で始まり .js で終わる
  呼び名（import・export … from・import(…)）、js/main.js の APP_VERSION、version.json。
- data/ の JSON・settings.json の読み込み（fetch）には付けない。
- 何も変わらなければ、ファイルを書き換えない（更新日時も変えない）。
- --check：書き換えずに確かめ、違うファイルと場所を表示して1で終わる。合っていれば0で終わる。
"""

import hashlib
import json
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
VERSION_FILE = "version.json"
MAIN_JS = "js/main.js"
NUMBER_LENGTH = 10

# index.html の、番号を付ける呼び名
HTML_RE = re.compile(r'(<script\b[^>]*\bsrc=")(js/main\.js)(\?v=[^"]*)?(")'
                     r'|(<link\b[^>]*\bhref=")(css/style\.css)(\?v=[^"]*)?(")')
# .js の中の、番号を付ける呼び名（import … from '…'、export … from '…'、import '…'、import('…')）
JS_RE = re.compile(r"""(\bfrom\s*|\bimport\s*|\bimport\s*\(\s*)(['"])(\.\.?/[^'"\s?]+?\.js)(\?v=[^'"]*)?(\2)""")
# js/main.js の版の番号
APP_VERSION_RE = re.compile(r"""(\bconst\s+APP_VERSION\s*=\s*)(['"])([^'"]*)(\2)""")


def read_text(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write_text(path, text):
    with open(path, "w", encoding="utf-8", newline="") as f:
        f.write(text)


def number_files():
    """番号の計算に使うファイル（app/ からの相対の名前）を、名前の順に返す。"""
    names = ["index.html", "settings.json"]
    names += [p.relative_to(APP).as_posix() for p in (APP / "js").rglob("*.js")]
    names += [p.relative_to(APP).as_posix() for p in (APP / "css").rglob("*.css")]
    names += [p.relative_to(APP).as_posix() for p in (APP / "data").rglob("*.json")]
    return sorted(n for n in set(names) if (APP / n).is_file())


def stamp_files():
    """番号を付けるファイル（index.html と js/ の .js）を、名前の順に返す。"""
    names = ["index.html"] + [p.relative_to(APP).as_posix() for p in (APP / "js").rglob("*.js")]
    return sorted(n for n in names if (APP / n).is_file())


def apply(name, text, number):
    """name の中身 text の番号を number に付け替えた中身を返す。number が空なら番号を取り除く。"""
    tail = "?v=" + number if number else ""
    if name == "index.html":
        def html(m):
            if m.group(2):
                return m.group(1) + m.group(2) + tail + m.group(4)
            return m.group(5) + m.group(6) + tail + m.group(8)
        return HTML_RE.sub(html, text)
    if name.endswith(".js"):
        text = JS_RE.sub(lambda m: m.group(1) + m.group(2) + m.group(3) + tail + m.group(5), text)
        if name == MAIN_JS:
            text = APP_VERSION_RE.sub(lambda m: m.group(1) + m.group(2) + number + m.group(4), text)
        return text
    return text


def compute_number():
    """番号を取り除いた中身から、版の番号を計算する。"""
    h = hashlib.sha256()
    for name in number_files():
        text = read_text(APP / name)
        h.update(name.encode("utf-8") + b"\0")
        h.update(apply(name, text, "").encode("utf-8") + b"\0")
    return h.hexdigest()[:NUMBER_LENGTH]


def version_json(number):
    return json.dumps({"version": number}, ensure_ascii=False) + "\n"


def differences(name, text, expected):
    """いまの中身と、あるべき中身の違う行を返す（「名前:行番号: 中身」）。"""
    out = []
    now_lines, want_lines = text.split("\n"), expected.split("\n")
    for i, (now, want) in enumerate(zip(now_lines, want_lines), 1):
        if now != want:
            out.append("%s:%d: %s" % (name, i, now.strip()))
    if len(now_lines) != len(want_lines):
        out.append("%s: 行の数が違う" % name)
    return out


def check_problems(number):
    """番号がすべて number になっているかを確かめ、違う所の一覧を返す。"""
    problems = []
    for name in stamp_files():
        text = read_text(APP / name)
        expected = apply(name, text, number)
        if text != expected:
            problems += differences(name, text, expected)
    if MAIN_JS in stamp_files() and not APP_VERSION_RE.search(read_text(APP / MAIN_JS)):
        problems.append("%s: APP_VERSION が無い" % MAIN_JS)
    vpath = APP / VERSION_FILE
    if not vpath.is_file():
        problems.append("%s: ファイルが無い" % VERSION_FILE)
    elif read_text(vpath) != version_json(number):
        problems.append("%s: %s" % (VERSION_FILE, read_text(vpath).strip()))
    return problems


def stamp(number):
    """番号を付け直し、書き換えたファイルの名前の一覧を返す。変わらないファイルは書き換えない。"""
    changed = []
    for name in stamp_files():
        text = read_text(APP / name)
        expected = apply(name, text, number)
        if text != expected:
            write_text(APP / name, expected)
            changed.append(name)
    vpath = APP / VERSION_FILE
    if not vpath.is_file() or read_text(vpath) != version_json(number):
        write_text(vpath, version_json(number))
        changed.append(VERSION_FILE)
    return changed


def main(argv):
    number = compute_number()
    if "--check" in argv:
        problems = check_problems(number)
        if problems:
            print("版の番号が今の中身から計算した番号（%s）になっていない所があります（%d件）：" % (number, len(problems)))
            for p in problems:
                print("  " + p)
            print("app/ で python3 tools/stamp_version.py を動かしてください。")
            return 1
        print("版の番号：%s（すべてのファイルで合っています）" % number)
        return 0
    changed = stamp(number)
    print("版の番号：%s" % number)
    print("書き換えたファイル：%d" % len(changed))
    for name in changed:
        print("  " + name)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
