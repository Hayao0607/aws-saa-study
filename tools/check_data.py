#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公開用データを確かめる仕組み。

実行: app/ から  python tools/check_data.py
すべて通れば終了コード0、1つでも通らなければ1を返す。
確かめた内容と結果を、1項目1行で表示する。

段階6-9で、段階6-8bの新しいデータの形に合わせた。
- links は card_type と pairs（問題文の語句 ⇔ カードの表の言葉。start・end・text を持つ）
- cards.json のカードに card_type
- 中身が空のレッスンがないことも確かめる
- 学習の対象から外した2問が、どこにも入っていないことを確かめる

段階6-13で、段階6-11〜6-13のデータ（cards.json の back_note・check_choices）に合わせた。
- data/90_archive/stage6_12b/check_app_data.py の17項目を取り込んだ（項目17〜20）
- back_note は書き出す項目になったので、入れてはいけない語から外した
- 学習の対象から外した問題に aws2-q232 を足した
- 2択のカードかどうかは、リポジトリにある記録（data/90_archive/stage6_12・6-12b・6-13 の
  out/choices_log.jsonl の kind）で見る。記録が無いところ（app/ だけを持ち出したとき）では、
  数が0〜3つであることだけを確かめる

段階6-16で、段階6-15b のデータ（links の contrast_pairs、カード748枚）に合わせた。
- links に contrast_pairs（問題文の語句 ⇔ カードの表の言葉。pairs と同じ形）を許す
- 項目21：contrast_pairs の語句が、問題文・カードの表のその位置にそのままある
- 項目22：contrast_pairs があるのは、role が eliminate の対応だけ（画面では、ほかの選択肢が
  違う理由のカードにだけ出すため）
- 2択の記録に、段階6-15・6-15b の choices_log.jsonl を足した

段階6-17で、データが変わっても古くならない形にした。
- 見込みの数（問題・採用・重複・カード）と、学習の対象から外した問題は、問題プール（data/01_pool/ の
  questions.jsonl の learning_target・status、cards.json の in_use）から数える。問題プールが無いところ
  （app/ だけを持ち出したとき）では、見込みとの照らし合わせをせず、数だけを出す
- 2択の記録は、段階の名前を書き並べず、data/90_archive/ にある out/choices_log.jsonl をすべて読む
  （段階の名前の順に読み、後の段階の記録で上書きする）

段階6-22で、段階6-15d・6-15e のデータ（問題の解説 explanation、事実のカードの pairs）と、段階6-20の用語集
（glossary.json）に合わせた。
- questions.json の問題に explanation（correct・wrong の label・reason。reason は空でもよい）を許す
- 事実のカードの pairs は0個以上（段階6-15e。項目10）
- 入れてはいけない語から、解説の項目名（explanation・reason）を外した（アプリが読む項目になったため）
- 項目23：explanation の記号が、正解・不正解の選択肢と1つずつ合う
- 項目24：glossary.json が決めた形で、関係する用語・分野が正しい
- 項目25：glossary.json の当たりの位置（question_terms・card_terms）が、問題文・選択肢・カードの表と答えの
  その位置にそのままある

段階6-22bで、版の番号（tools/stamp_version.py）の確かめを足した。
- 項目30：プログラムのファイルの呼び名・APP_VERSION・version.json の番号が、今の中身から計算した番号に
  なっている（python3 tools/stamp_version.py --check と同じ確かめ）
"""

import json
import math
import re
import sys
from pathlib import Path

APP = Path(__file__).resolve().parents[1]
DATA = APP / "data"

POOL = APP.parent / "data" / "01_pool"


def load_pool_expect():
    """問題プールから、見込みの数と学習の対象から外した問題を数える。問題プールが無ければ None。"""
    qpath, cpath = POOL / "questions.jsonl", POOL / "cards.json"
    if not (qpath.exists() and cpath.exists()):
        return None
    qs = [json.loads(l) for l in open(qpath, encoding="utf-8") if l.strip()]
    target = [q for q in qs if q.get("learning_target")]
    cards = json.load(open(cpath, encoding="utf-8"))["cards"]
    return {
        "total": len(target),
        "adopted": sum(1 for q in target if q["status"] == "active"),
        "duplicate": sum(1 for q in target if q["status"] == "duplicate"),
        "cards": sum(1 for c in cards if c.get("in_use")),
        "excluded": sorted(q["id"] for q in qs if not q.get("learning_target")),
    }


EXPECT = load_pool_expect()

# app/ に入れてはいけない項目名・語。
# この仕組み自身も走査の対象になるため、語をそのままは書かず、断片をつないで組み立てる。
BANNED_PARTS = [
    ("card_", "solu", "tion"),
    ("decis", "ive_", "note"),
    ("verif", "ication"),
    ("evid", "ence_", "url"),
    ("mate", "rials"),
    ("learning_", "exclu", "sion_", "rea", "son"),
    ("answers", "_orig", "inal"),
    ("front_", "spans"),
    ("dropped_", "pairs"),
    ("unpaired_", "front_", "spans"),
]
BANNED = ["".join(parts) for parts in BANNED_PARTS]

results = []


def record(name, ok, detail=""):
    results.append((name, ok, detail))


def fail_detail(items, limit=5):
    items = list(items)
    head = "、".join(str(x) for x in items[:limit])
    if len(items) > limit:
        head += " ほか%d件" % (len(items) - limit)
    return head


def need(cond, errors, msg):
    if not cond:
        errors.append(msg)


# ---------------------------------------------------------------- 1. 形式

def check_shape():
    errors = []
    docs = {}
    for name in ("questions.json", "cards.json", "curriculum.json"):
        path = DATA / name
        if not path.exists():
            errors.append("%s がない" % name)
            continue
        try:
            docs[name] = json.load(open(path, encoding="utf-8"))
        except Exception as exc:
            errors.append("%s が読めない: %s" % (name, exc))

    def check_meta(doc, name, source_key):
        meta = doc.get("meta")
        need(isinstance(meta, dict), errors, "%s: meta がない" % name)
        if not isinstance(meta, dict):
            return
        need(isinstance(meta.get("generated_at"), str) and meta["generated_at"],
             errors, "%s: meta.generated_at がない" % name)
        src = meta.get("source")
        need(isinstance(src, dict), errors, "%s: meta.source がない" % name)
        if isinstance(src, dict):
            h = src.get(source_key)
            need(isinstance(h, str) and len(h) == 64, errors,
                 "%s: meta.source.%s が SHA-256 でない" % (name, source_key))

    def check_keys(obj, allowed, label):
        if not isinstance(obj, dict):
            errors.append("%s: 辞書でない" % label)
            return False
        extra = sorted(set(obj) - set(allowed))
        missing = sorted(set(allowed) - set(obj))
        if extra:
            errors.append("%s: 余分な項目 %s" % (label, extra))
        if missing:
            errors.append("%s: 足りない項目 %s" % (label, missing))
        return not extra and not missing

    def check_span(obj, label):
        """問題文・カードの表の語句（start・end・text の組）の形。"""
        if not check_keys(obj, ["start", "end", "text"], label):
            return
        need(isinstance(obj["start"], int) and isinstance(obj["end"], int), errors,
             "%s: start/end が整数でない" % label)
        need(isinstance(obj["text"], str) and obj["text"], errors,
             "%s: text が文字列でない" % label)

    def check_links(items, label, labels):
        if not isinstance(items, list):
            errors.append("%s.links: 配列でない" % label)
            return
        for i, lk in enumerate(items):
            llabel = "%s.links[%d]" % (label, i)
            if not check_keys(lk, ["card_id", "card_type", "pairs", "contrast_pairs",
                                   "choice_label", "choice_phrase", "role"], llabel):
                continue
            need(isinstance(lk["card_id"], str) and lk["card_id"], errors,
                 "%s: card_id が文字列でない" % llabel)
            need(lk["card_type"] in ("condition", "fact"), errors,
                 "%s: card_type が condition・fact でない" % llabel)
            for key in ("pairs", "contrast_pairs"):
                if not isinstance(lk[key], list):
                    errors.append("%s: %s が配列でない" % (llabel, key))
                    continue
                for j, pair in enumerate(lk[key]):
                    plabel = "%s.%s[%d]" % (llabel, key, j)
                    if not check_keys(pair, ["question_phrase", "card_phrase"], plabel):
                        continue
                    check_span(pair["question_phrase"], "%s.question_phrase" % plabel)
                    check_span(pair["card_phrase"], "%s.card_phrase" % plabel)
            if lk["choice_label"] is None:
                need(lk["choice_phrase"] is None and lk["role"] is None, errors,
                     "%s: choice_label が null なのに choice_phrase・role が入っている" % llabel)
            else:
                need(lk["choice_label"] in labels, errors,
                     "%s: choice_label が選択肢の記号でない" % llabel)
                need(isinstance(lk["choice_phrase"], str) and lk["choice_phrase"], errors,
                     "%s: choice_phrase が文字列でない" % llabel)
                need(lk["role"] in ("correct", "eliminate"), errors,
                     "%s: role が correct・eliminate でない" % llabel)

    def check_unit_cards(items, label):
        if not isinstance(items, list):
            errors.append("%s.cards: 配列でない" % label)
            return
        for i, x in enumerate(items):
            xlabel = "%s.cards[%d]" % (label, i)
            if not check_keys(x, ["id", "seen_before"], xlabel):
                continue
            need(isinstance(x["id"], str) and x["id"], errors, "%s: id が文字列でない" % xlabel)
            need(isinstance(x["seen_before"], bool), errors,
                 "%s: seen_before が真偽値でない" % xlabel)

    def check_explanation_shape(ex, label):
        """解説（段階6-15d・6-15e）：{ correct: [{label, reason}], wrong: [{label, reason}] }。reason は空でもよい。"""
        if not check_keys(ex, ["correct", "wrong"], "%s.explanation" % label):
            return
        for key in ("correct", "wrong"):
            if not isinstance(ex[key], list):
                errors.append("%s.explanation.%s: 配列でない" % (label, key))
                continue
            for i, item in enumerate(ex[key]):
                elabel = "%s.explanation.%s[%d]" % (label, key, i)
                if not check_keys(item, ["label", "reason"], elabel):
                    continue
                need(isinstance(item["label"], str) and item["label"], errors,
                     "%s: label が文字列でない" % elabel)
                need(isinstance(item["reason"], str), errors, "%s: reason が文字列でない" % elabel)

    def check_highlights(hls, label):
        if not isinstance(hls, list):
            errors.append("%s.highlights: 配列でない" % label)
            return
        for i, h in enumerate(hls):
            if not check_keys(h, ["start", "end"], "%s.highlights[%d]" % (label, i)):
                continue
            need(isinstance(h["start"], int) and isinstance(h["end"], int), errors,
                 "%s.highlights[%d]: start/end が整数でない" % (label, i))

    if "questions.json" in docs:
        doc = docs["questions.json"]
        check_keys(doc, ["meta", "questions"], "questions.json")
        check_meta(doc, "questions.json", "questions.jsonl")
        qs = doc.get("questions")
        if not isinstance(qs, list):
            errors.append("questions.json: questions が配列でない")
        else:
            for q in qs:
                label = "questions[%s]" % (q.get("id") if isinstance(q, dict) else "?")
                if not check_keys(q, ["id", "type", "select_count", "text", "choices",
                                      "highlights", "card_ids", "links", "explanation"], label):
                    continue
                check_explanation_shape(q["explanation"], label)
                need(isinstance(q["id"], str) and q["id"], errors, "%s: id が文字列でない" % label)
                need(q["type"] in ("adopted", "duplicate"), errors,
                     "%s: type が adopted/duplicate でない" % label)
                need(isinstance(q["select_count"], int) and q["select_count"] >= 1, errors,
                     "%s: select_count が整数でない" % label)
                need(isinstance(q["text"], str) and q["text"], errors,
                     "%s: text が文字列でない" % label)
                need(isinstance(q["card_ids"], list)
                     and all(isinstance(x, str) for x in q["card_ids"]),
                     errors, "%s: card_ids が文字列の配列でない" % label)
                if isinstance(q["choices"], list) and q["choices"]:
                    for i, ch in enumerate(q["choices"]):
                        clabel = "%s.choices[%d]" % (label, i)
                        if not check_keys(ch, ["label", "text", "correct"], clabel):
                            continue
                        need(isinstance(ch["label"], str) and ch["label"], errors,
                             "%s: label が文字列でない" % clabel)
                        need(isinstance(ch["text"], str) and ch["text"], errors,
                             "%s: text が文字列でない" % clabel)
                        need(isinstance(ch["correct"], bool), errors,
                             "%s: correct が真偽値でない" % clabel)
                else:
                    errors.append("%s: choices が空か配列でない" % label)
                check_highlights(q["highlights"], label)
                labels = ([ch.get("label") for ch in q["choices"]]
                          if isinstance(q["choices"], list) else [])
                check_links(q["links"], label, labels)

    if "cards.json" in docs:
        doc = docs["cards.json"]
        check_keys(doc, ["meta", "cards"], "cards.json")
        check_meta(doc, "cards.json", "cards.json")
        cs = doc.get("cards")
        if not isinstance(cs, list):
            errors.append("cards.json: cards が配列でない")
        else:
            for c in cs:
                label = "cards[%s]" % (c.get("id") if isinstance(c, dict) else "?")
                if not check_keys(c, ["id", "card_type", "front", "back", "back_note",
                                      "category", "highlights", "check_choices"], label):
                    continue
                for key in ("id", "front", "back", "category"):
                    need(isinstance(c[key], str) and c[key], errors,
                         "%s: %s が文字列でない" % (label, key))
                need(isinstance(c["back_note"], str), errors,
                     "%s: back_note が文字列でない" % label)
                need(isinstance(c["check_choices"], list)
                     and all(isinstance(x, str) and x for x in c["check_choices"]),
                     errors, "%s: check_choices が文字列の配列でない" % label)
                need(c["card_type"] in ("condition", "fact"), errors,
                     "%s: card_type が condition・fact でない" % label)
                check_highlights(c["highlights"], label)

    if "curriculum.json" in docs:
        doc = docs["curriculum.json"]
        check_keys(doc, ["meta", "categories"], "curriculum.json")
        check_meta(doc, "curriculum.json", "curriculum.json")
        cats = doc.get("categories")
        if not isinstance(cats, list) or not cats:
            errors.append("curriculum.json: categories が空か配列でない")
        else:
            for cat in cats:
                label = "categories[%s]" % (cat.get("name") if isinstance(cat, dict) else "?")
                if not check_keys(cat, ["name", "blocks", "tests"], label):
                    continue
                need(isinstance(cat["name"], str) and cat["name"], errors,
                     "%s: name が文字列でない" % label)
                if not isinstance(cat["blocks"], list) or not cat["blocks"]:
                    errors.append("%s: blocks が空か配列でない" % label)
                else:
                    for b in cat["blocks"]:
                        blabel = "%s.blocks[%s]" % (
                            label, b.get("id") if isinstance(b, dict) else "?")
                        if not check_keys(b, ["id", "name", "units", "test"], blabel):
                            continue
                        need(isinstance(b["id"], str) and b["id"], errors,
                             "%s: id が文字列でない" % blabel)
                        need(isinstance(b["name"], str) and b["name"], errors,
                             "%s: name が文字列でない" % blabel)
                        if not isinstance(b["units"], list) or not b["units"]:
                            errors.append("%s: units が空か配列でない" % blabel)
                        else:
                            for u in b["units"]:
                                ulabel = "%s.units[%s]" % (
                                    blabel, u.get("id") if isinstance(u, dict) else "?")
                                if not check_keys(u, ["id", "name", "question_ids",
                                                      "duplicate_question_ids", "card_ids",
                                                      "cards"], ulabel):
                                    continue
                                need(isinstance(u["id"], str) and u["id"], errors,
                                     "%s: id が文字列でない" % ulabel)
                                need(isinstance(u["name"], str) and u["name"], errors,
                                     "%s: name が文字列でない" % ulabel)
                                for key in ("question_ids", "duplicate_question_ids", "card_ids"):
                                    need(isinstance(u[key], list)
                                         and all(isinstance(x, str) for x in u[key]),
                                         errors, "%s: %s が文字列の配列でない" % (ulabel, key))
                                check_unit_cards(u["cards"], ulabel)
                        if check_keys(b["test"], ["question_ids", "pass_score"],
                                      "%s.test" % blabel):
                            need(isinstance(b["test"]["question_ids"], list)
                                 and all(isinstance(x, str) for x in b["test"]["question_ids"]),
                                 errors, "%s.test: question_ids が文字列の配列でない" % blabel)
                            need(isinstance(b["test"]["pass_score"], int), errors,
                                 "%s.test: pass_score が整数でない" % blabel)
                if not isinstance(cat["tests"], list) or not cat["tests"]:
                    errors.append("%s: tests が空か配列でない" % label)
                else:
                    for t in cat["tests"]:
                        tlabel = "%s.tests[%s]" % (
                            label, t.get("round") if isinstance(t, dict) else "?")
                        if not check_keys(t, ["round", "question_ids", "pass_score"], tlabel):
                            continue
                        need(isinstance(t["round"], int), errors, "%s: round が整数でない" % tlabel)
                        need(isinstance(t["question_ids"], list)
                             and all(isinstance(x, str) for x in t["question_ids"]),
                             errors, "%s: question_ids が文字列の配列でない" % tlabel)
                        need(isinstance(t["pass_score"], int), errors,
                             "%s: pass_score が整数でない" % tlabel)

    record("1. 3ファイルが読めて、決めた形になっている", not errors, fail_detail(errors))
    return docs, not errors


# ---------------------------------------------------------------- 2. 件数

def check_counts(questions, cards):
    adopted = sum(1 for q in questions if q["type"] == "adopted")
    duplicate = sum(1 for q in questions if q["type"] == "duplicate")
    total = len(questions)
    ncards = len(cards)
    bad = []
    if EXPECT and (total, adopted, duplicate, ncards) != (
            EXPECT["total"], EXPECT["adopted"], EXPECT["duplicate"], EXPECT["cards"]):
        bad.append("問題プールの数 問題 %d（採用 %d・重複 %d）/ カード %d枚"
                   % (EXPECT["total"], EXPECT["adopted"], EXPECT["duplicate"], EXPECT["cards"]))
    if len({q["id"] for q in questions}) != total:
        bad.append("問題IDに重複がある")
    if len({c["id"] for c in cards}) != ncards:
        bad.append("カードIDに重複がある")
    detail = "問題 %d（採用 %d・重複 %d）/ カード %d枚" % (total, adopted, duplicate, ncards)
    if bad:
        detail += "（%s）" % "、".join(bad)
    if not EXPECT:
        detail += "（問題プールが無いため、見込みとは照らし合わせていない）"
    record("2. 件数が問題プールの数と一致し、IDに重複がない", not bad, detail)
    return not bad


# ---------------------------------------------------------------- 3. 参照の切れ

def check_references(questions, cards, categories):
    qids = {q["id"] for q in questions}
    cids = {c["id"] for c in cards}
    missing = []
    for q in questions:
        for cid in q["card_ids"]:
            if cid not in cids:
                missing.append("%s -> %s" % (q["id"], cid))
    ok1 = not missing
    record("3-1. 問題の card_ids のカードが、すべて cards.json にある", ok1, fail_detail(missing))

    missing_q, missing_c = [], []
    for cat in categories:
        for b in cat["blocks"]:
            for u in b["units"]:
                for i in u["question_ids"] + u["duplicate_question_ids"]:
                    if i not in qids:
                        missing_q.append("%s/%s" % (u["id"], i))
                for cid in u["card_ids"] + [x["id"] for x in u["cards"]]:
                    if cid not in cids:
                        missing_c.append("%s/%s" % (u["id"], cid))
            for i in b["test"]["question_ids"]:
                if i not in qids:
                    missing_q.append("%s(章末テスト)/%s" % (b["id"], i))
        for t in cat["tests"]:
            for i in t["question_ids"]:
                if i not in qids:
                    missing_q.append("%s 第%d回/%s" % (cat["name"], t["round"], i))
    ok2 = not missing_q and not missing_c
    record("3-2. 並び順の問題・カードのIDが、すべて questions.json・cards.json にある", ok2,
           fail_detail(missing_q + missing_c))
    return ok1 and ok2


# ---------------------------------------------------------------- 4. 並び順

def check_order(questions, cards, categories):
    by_id = {q["id"]: q for q in questions}
    cids = [c["id"] for c in cards]

    unit_cards, unit_q, unit_dup, block_test, round_test = {}, {}, {}, {}, {}
    unit_sequence = []
    for cat in categories:
        for b in cat["blocks"]:
            for u in b["units"]:
                unit_sequence.append(u)
                for cid in u["card_ids"]:
                    unit_cards.setdefault(cid, []).append(u["id"])
                for i in u["question_ids"]:
                    unit_q.setdefault(i, []).append(u["id"])
                for i in u["duplicate_question_ids"]:
                    unit_dup.setdefault(i, []).append(u["id"])
            for i in b["test"]["question_ids"]:
                block_test.setdefault(i, []).append(b["id"])
        for t in cat["tests"]:
            for i in t["question_ids"]:
                round_test.setdefault(i, []).append("%s 第%d回" % (cat["name"], t["round"]))

    bad = []
    for cid in cids:
        n = len(unit_cards.get(cid, []))
        if n != 1:
            bad.append("%s:%d個のレッスン" % (cid, n))
    for cid in unit_cards:
        if cid not in set(cids):
            bad.append("%s:cards.json にない" % cid)
    ok1 = not bad
    record("4-1. カード%d枚が、ちょうど1つのレッスンの card_ids に入っている" % len(cards),
           ok1, fail_detail(bad))

    bad = []
    for q in questions:
        if q["type"] != "adopted":
            continue
        i = q["id"]
        if len(unit_q.get(i, [])) != 1:
            bad.append("%s:レッスン%d個" % (i, len(unit_q.get(i, []))))
        if len(block_test.get(i, [])) != 1:
            bad.append("%s:章末テスト%d個" % (i, len(block_test.get(i, []))))
        if len(round_test.get(i, [])) != 1:
            bad.append("%s:分野テストの回%d個" % (i, len(round_test.get(i, []))))
    for i in unit_q:
        if by_id.get(i, {}).get("type") != "adopted":
            bad.append("%s:レッスンの question_ids にあるが採用問題でない" % i)
    ok2 = not bad
    record("4-2. 採用問題が、ちょうど1つのレッスン・1つの章末テスト・1つの分野テストの回に入っている",
           ok2, fail_detail(bad))

    bad = []
    for q in questions:
        if q["type"] != "duplicate":
            continue
        i = q["id"]
        if len(unit_dup.get(i, [])) != 1:
            bad.append("%s:レッスン%d個" % (i, len(unit_dup.get(i, []))))
        if block_test.get(i) or round_test.get(i):
            bad.append("%s:テストに入っている" % i)
    for i in unit_dup:
        if by_id.get(i, {}).get("type") != "duplicate":
            bad.append("%s:duplicate_question_ids にあるが重複問題でない" % i)
    ok3 = not bad
    record("4-3. 重複問題が、ちょうど1つのレッスンに入り、テストには入っていない", ok3, fail_detail(bad))

    seen = set()
    bad = []
    for u in unit_sequence:
        seen |= set(u["card_ids"])
        for i in u["question_ids"] + u["duplicate_question_ids"]:
            for cid in by_id.get(i, {}).get("card_ids", []):
                if cid not in seen:
                    bad.append("%s/%s -> %s" % (u["id"], i, cid))
    ok4 = not bad
    record("4-4. 各問題の card_ids が、その問題のレッスンまでにすべて出ている", ok4, fail_detail(bad))
    return ok1 and ok2 and ok3 and ok4


# ---------------------------------------------------------------- 5. 選択肢

def check_choices(questions):
    bad = []
    for q in questions:
        n = sum(1 for c in q["choices"] if c["correct"])
        if n != q["select_count"]:
            bad.append("%s:正解%d/select_count%d" % (q["id"], n, q["select_count"]))
        labels = [c["label"] for c in q["choices"]]
        if len(set(labels)) != len(labels):
            bad.append("%s:記号の重複" % q["id"])
    record("5. 正解の数が select_count と一致し、選択肢の記号に重複がない", not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 6. 色の位置

def check_highlight_range(questions, cards):
    bad = []
    for q in questions:
        length = len(q["text"])
        for h in q["highlights"]:
            if not (0 <= h["start"] < h["end"] <= length):
                bad.append("%s:[%d,%d)/%d字" % (q["id"], h["start"], h["end"], length))
    for c in cards:
        length = len(c["front"])
        for h in c["highlights"]:
            if not (0 <= h["start"] < h["end"] <= length):
                bad.append("%s(表):[%d,%d)/%d字" % (c["id"], h["start"], h["end"], length))
    record("6. 問題文・カードの表の色の位置が 0 <= start < end <= 文字数 を満たす",
           not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 7. 合格ライン

def check_pass_score(categories):
    name = "7. 各テストの pass_score が 問題数 × pass_rate の切り上げと一致する"
    path = APP / "settings.json"
    if not path.exists():
        record(name, False, "settings.json がない")
        return False
    settings = json.load(open(path, encoding="utf-8"))
    rate = settings.get("pass_rate")
    if not isinstance(rate, (int, float)):
        record(name, False, "settings.json の pass_rate が数値でない")
        return False
    bad = []
    for cat in categories:
        for b in cat["blocks"]:
            n = len(b["test"]["question_ids"])
            want = math.ceil(n * rate)
            if b["test"]["pass_score"] != want:
                bad.append("%s 章末テスト:%d問/pass_score %d（期待 %d）"
                           % (b["id"], n, b["test"]["pass_score"], want))
        for t in cat["tests"]:
            n = len(t["question_ids"])
            want = math.ceil(n * rate)
            if t["pass_score"] != want:
                bad.append("%s 第%d回:%d問/pass_score %d（期待 %d）"
                           % (cat["name"], t["round"], n, t["pass_score"], want))
    record("7. 各テストの pass_score が 問題数 × pass_rate(%s) の切り上げと一致する" % rate,
           not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 8. 入れてはいけないもの

def check_banned():
    hits = []
    for path in sorted(APP.rglob("*")):
        if not path.is_file():
            continue
        try:
            text = path.read_bytes().decode("utf-8", errors="ignore").lower()
        except OSError as exc:
            hits.append("%s:読めない(%s)" % (path.relative_to(APP), exc))
            continue
        for word in BANNED:
            if word in text:
                hits.append("%s:%s" % (path.relative_to(APP), word))
    record("8. app/ 以下のすべてのファイルに、入れてはいけない%d語が含まれていない" % len(BANNED),
           not hits, fail_detail(hits))
    return not hits


# ---------------------------------------------------------------- 9. links の中身

def check_links_content(questions, cards):
    by_card = {c["id"]: c for c in cards}
    bad = []
    nlinks = npairs = 0
    for q in questions:
        links = q["links"]
        ids = [lk["card_id"] for lk in links]
        if ids != list(q["card_ids"]):
            bad.append("%s:links の並びが card_ids と一致しない" % q["id"])
            continue
        if len(set(ids)) != len(ids):
            bad.append("%s:links に同じカードが2つ以上ある" % q["id"])
            continue
        by_label = {ch["label"]: ch for ch in q["choices"]}
        for lk in links:
            nlinks += 1
            tag = "%s/%s" % (q["id"], lk["card_id"])
            front = by_card.get(lk["card_id"], {}).get("front", "")
            for pair in lk["pairs"]:
                npairs += 1
                qp, cp = pair["question_phrase"], pair["card_phrase"]
                if q["text"][qp["start"]:qp["end"]] != qp["text"]:
                    bad.append("%s:question_phrase が問題文のその位置と合わない" % tag)
                if front[cp["start"]:cp["end"]] != cp["text"]:
                    bad.append("%s:card_phrase がカードの表のその位置と合わない" % tag)
            label = lk["choice_label"]
            if label is None:
                continue
            choice = by_label.get(label)
            if choice is None:
                bad.append("%s:choice_label %s の選択肢がない" % (tag, label))
                continue
            if lk["choice_phrase"] not in choice["text"]:
                bad.append("%s:choice_phrase が選択肢 %s の本文にそのままない" % (tag, label))
    record("9. links が組のカードすべてに1つずつあり、語句が問題文・カードの表・選択肢の"
           "その位置にそのままある", not bad, fail_detail(bad) or "対応 %d・組 %d" % (nlinks, npairs))
    return not bad


# ---------------------------------------------------------------- 10. カードの種類ごとの形

def check_link_types(questions, cards):
    by_card = {c["id"]: c for c in cards}
    bad = []
    for q in questions:
        for lk in q["links"]:
            tag = "%s/%s" % (q["id"], lk["card_id"])
            if lk["card_type"] == "condition":
                if not lk["pairs"]:
                    bad.append("%s:条件のカードなのに pairs が空" % tag)
            else:
                # 事実のカードの pairs は0個以上（段階6-15e）
                if lk["choice_label"] is None:
                    bad.append("%s:事実のカードなのに choice_label が null" % tag)
            if lk["card_type"] != by_card.get(lk["card_id"], {}).get("card_type"):
                bad.append("%s:card_type が cards.json のカードと合わない" % tag)
    record("10. 条件のカードは pairs が1つ以上、事実のカードは pairs が0個以上で choice_label があり、"
           "card_type がカードと一致する", not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 11. role

def check_roles(questions):
    bad = []
    for q in questions:
        correct = {c["label"] for c in q["choices"] if c["correct"]}
        for lk in q["links"]:
            tag = "%s/%s" % (q["id"], lk["card_id"])
            if lk["role"] is None:
                if lk["choice_label"] is not None:
                    bad.append("%s:role が null なのに choice_label がある" % tag)
                continue
            if lk["role"] == "correct" and lk["choice_label"] not in correct:
                bad.append("%s:role が correct だが正解の選択肢でない" % tag)
            if lk["role"] == "eliminate" and lk["choice_label"] in correct:
                bad.append("%s:role が eliminate だが正解の選択肢である" % tag)
    record("11. role が correct なら正解の選択肢、eliminate なら不正解の選択肢を指している",
           not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 12. 問題文の色

def check_question_highlights(questions):
    bad = []
    for q in questions:
        spans = sorted((p["question_phrase"]["start"], p["question_phrase"]["end"])
                       for lk in q["links"] for p in lk["pairs"])
        merged = []
        for start, end in spans:
            if merged and start < merged[-1][1]:
                merged[-1][1] = max(merged[-1][1], end)
            else:
                merged.append([start, end])
        want = [(a, b) for a, b in merged]
        got = sorted((h["start"], h["end"]) for h in q["highlights"])
        if want != got:
            bad.append("%s:色 %d個 / 組をまとめたもの %d個" % (q["id"], len(got), len(want)))
    record("12. 問題文の色が、全カードの pairs の question_phrase を合わせて重なりをまとめたものと"
           "一致する", not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 13. レッスンの cards

def check_unit_card_list(questions, categories):
    by_id = {q["id"]: q for q in questions}
    bad = []
    seen = set()
    for cat in categories:
        for b in cat["blocks"]:
            for u in b["units"]:
                wanted = set()
                for i in u["question_ids"] + u["duplicate_question_ids"]:
                    wanted |= set(by_id.get(i, {}).get("card_ids", []))
                shown = [x["id"] for x in u["cards"]]
                if len(set(shown)) != len(shown):
                    bad.append("%s:cards に同じカードが2つ以上ある" % u["id"])
                lack = sorted(wanted - set(shown))
                if lack:
                    bad.append("%s:組のカードが cards にない %s" % (u["id"], lack))
                extra = sorted(set(shown) - wanted)
                if extra:
                    bad.append("%s:組にないカードが cards にある %s" % (u["id"], extra))
                for x in u["cards"]:
                    if x["seen_before"] != (x["id"] in seen):
                        bad.append("%s/%s:seen_before が合っていない" % (u["id"], x["id"]))
                    if x["seen_before"] == (x["id"] in u["card_ids"]):
                        bad.append("%s/%s:seen_before と card_ids が合っていない"
                                   % (u["id"], x["id"]))
                seen |= set(shown)
    record("13. 各レッスンの cards に、そのレッスンの問題の組のカードがすべてあり、"
           "seen_before が正しい", not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 14. 中身が空のレッスン

def check_empty_units(categories):
    bad = []
    nunits = 0
    for cat in categories:
        for b in cat["blocks"]:
            for u in b["units"]:
                nunits += 1
                if not u["question_ids"] and not u["duplicate_question_ids"] and not u["cards"]:
                    bad.append("%s（%s）" % (u["id"], u["name"]))
    record("14. 中身が空のレッスン（問題0問・カード0枚）がない", not bad,
           fail_detail(bad) or "レッスン %d" % nunits)
    return not bad


# ---------------------------------------------------------------- 15. 外した問題

def check_excluded(questions, categories):
    if not EXPECT:
        record("15. 学習の対象から外した問題が、どこにも入っていない", True,
               "問題プールが無いため確かめていない")
        return True
    qids = {q["id"] for q in questions}
    bad = []
    for x in EXPECT["excluded"]:
        if x in qids:
            bad.append("%s が questions.json にある" % x)
        for cat in categories:
            for b in cat["blocks"]:
                for u in b["units"]:
                    if x in u["question_ids"] + u["duplicate_question_ids"]:
                        bad.append("%s が %s にある" % (x, u["id"]))
                if x in b["test"]["question_ids"]:
                    bad.append("%s が %s の章末テストにある" % (x, b["id"]))
            for t in cat["tests"]:
                if x in t["question_ids"]:
                    bad.append("%s が %s 第%d回にある" % (x, cat["name"], t["round"]))
    record("15. 学習の対象から外した%d問（問題プールの learning_target が false の問題）が、どこにも入っていない"
           % len(EXPECT["excluded"]),
           not bad, fail_detail(bad))
    return not bad


# ---------------------------------------------------------------- 16. 苦手な問題の設定値

def check_weak_questions():
    name = "16. settings.json に weak_questions がある"
    path = APP / "settings.json"
    if not path.exists():
        record(name, False, "settings.json がない")
        return False
    settings = json.load(open(path, encoding="utf-8"))
    weak = settings.get("weak_questions")
    if not isinstance(weak, dict):
        record(name, False, "weak_questions がない")
        return False
    bad = []
    for key in ("wrong_times_to_add", "correct_in_a_row_to_remove"):
        value = weak.get(key)
        if not isinstance(value, int) or isinstance(value, bool) or value < 1:
            bad.append("%s が1以上の整数でない" % key)
    extra = sorted(set(weak) - {"wrong_times_to_add", "correct_in_a_row_to_remove"})
    if extra:
        bad.append("余分な項目 %s" % extra)
    record(name, not bad, fail_detail(bad) or "間違い%d回で追加・連続%d回正解で解除"
           % (weak.get("wrong_times_to_add"), weak.get("correct_in_a_row_to_remove")))
    return not bad


# ---------------------------------------------------------------- 17. 補足（back_note）の言葉（段階6-11b）

# 補足は学ぶ人が読む文。作り手向けの言い方・出典のメモを入れない。
NOTE_META = ["公式は", "公式では", "公式ドキュメント", "ドキュメントでは", "ドキュメントによる",
             "出典", "段階", "stage", "http", "根拠", "問題集", "照合"]


def check_back_note_words(cards):
    bad = []
    for c in cards:
        for w in NOTE_META:
            if w in c["back_note"]:
                bad.append("%s に「%s」" % (c["id"], w))
    record("17. 補足（back_note）に作り手向けの言葉（%s）が入っていない" % "・".join(NOTE_META),
           not bad, fail_detail(bad))


# ---------------------------------------------------------------- 18〜20. ② 確かめるの選択肢（段階6-12）

def load_kinds():
    """2択のカードかどうか（kind）を、リポジトリにある記録から読む。後の段階の記録で上書きする。"""
    root = APP.parent / "data" / "90_archive"
    kinds = {}
    found = False

    def stage_key(path):
        # 段階の名前の順（stage6_9 < stage6_12 < stage6_12b < stage6_13 …）。数字は数として比べる
        name = path.parent.parent.name
        return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", name)]

    for path in sorted(root.glob("*/out/choices_log.jsonl"), key=stage_key):
        found = True
        for line in open(path, encoding="utf-8"):
            if line.strip():
                r = json.loads(line)
                kinds[r["card_id"]] = r["kind"]
    return kinds if found else None


def check_check_choices(cards):
    bad = [c["id"] for c in cards
           if not isinstance(c.get("check_choices"), list)
           or not all(isinstance(x, str) and x for x in c["check_choices"])]
    record("18. check_choices：使っているカードすべてにあり、文の並びになっている",
           not bad, fail_detail(bad))

    kinds = load_kinds()
    bad = []
    zero = [c["id"] for c in cards if not c["check_choices"]]
    for c in cards:
        n = len(c["check_choices"])
        if kinds is None:
            if n > 3:
                bad.append("%s: %d" % (c["id"], n))
            continue
        k = kinds.get(c["id"])
        if k == "binary" and n > 1:
            bad.append("%s: 2択で %d" % (c["id"], n))
        elif k == "multi" and n > 3:
            bad.append("%s: 4択で %d" % (c["id"], n))
        elif k not in ("binary", "multi"):
            bad.append("%s: kind の記録がない" % c["id"])
    detail = fail_detail(bad) or ("めくる形（選択肢0）のカード %d枚%s" % (
        len(zero), ("：" + "、".join(zero)) if zero else ""))
    if kinds is None:
        detail += "（2択かどうかの記録が無いため、数が0〜3つであることだけを確かめた）"
    record("19. check_choices の数：2択のカードは1つ、それ以外は1〜3つ（0はめくる形で出す）",
           not bad, detail)

    bad = []
    for c in cards:
        v = c["check_choices"]
        if c["back"] in v:
            bad.append("%s: 正しい答えと同じ文" % c["id"])
        if len(set(v)) != len(v):
            bad.append("%s: 選択肢どうしが同じ文" % c["id"])
    record("20. check_choices：正しい答え（裏）と同じ文がなく、選択肢どうしも同じ文でない",
           not bad, fail_detail(bad))


# ---------------------------------------------------------------- 21〜22. contrast_pairs（段階6-16）

def check_contrast_pairs(questions, cards):
    by_card = {c["id"]: c for c in cards}
    bad = []
    n = 0
    for q in questions:
        for lk in q["links"]:
            tag = "%s/%s" % (q["id"], lk["card_id"])
            front = by_card.get(lk["card_id"], {}).get("front", "")
            for pair in lk["contrast_pairs"]:
                n += 1
                qp, cp = pair["question_phrase"], pair["card_phrase"]
                if not (0 <= qp["start"] < qp["end"] <= len(q["text"])) \
                        or q["text"][qp["start"]:qp["end"]] != qp["text"]:
                    bad.append("%s:contrast_pairs の question_phrase が問題文のその位置と合わない" % tag)
                if not (0 <= cp["start"] < cp["end"] <= len(front)) \
                        or front[cp["start"]:cp["end"]] != cp["text"]:
                    bad.append("%s:contrast_pairs の card_phrase がカードの表のその位置と合わない" % tag)
    record("21. contrast_pairs の語句が、問題文・カードの表のその位置にそのままある",
           not bad, fail_detail(bad) or "組 %d" % n)

    bad = []
    for q in questions:
        for lk in q["links"]:
            if lk["contrast_pairs"] and lk["role"] != "eliminate":
                bad.append("%s/%s:role が %s" % (q["id"], lk["card_id"], lk["role"]))
    record("22. contrast_pairs があるのは、role が eliminate の対応だけ", not bad, fail_detail(bad))


# ---------------------------------------------------------------- 23. 解説（段階6-22）

def check_explanations(questions):
    bad = []
    nempty = 0
    for q in questions:
        ex = q["explanation"]
        correct = sorted(c["label"] for c in q["choices"] if c["correct"])
        wrong = sorted(c["label"] for c in q["choices"] if not c["correct"])
        got_c = [x["label"] for x in ex["correct"]]
        got_w = [x["label"] for x in ex["wrong"]]
        if sorted(got_c) != correct or len(set(got_c)) != len(got_c):
            bad.append("%s:explanation.correct の記号 %s が正解 %s と合わない" % (q["id"], got_c, correct))
        if sorted(got_w) != wrong or len(set(got_w)) != len(got_w):
            bad.append("%s:explanation.wrong の記号 %s が不正解 %s と合わない" % (q["id"], got_w, wrong))
        nempty += sum(1 for x in ex["correct"] + ex["wrong"] if not x["reason"].strip())
    record("23. explanation の記号が、正解・不正解の選択肢（元の並びの記号）と1つずつ合う",
           not bad, fail_detail(bad) or "問題 %d・理由が空 %d" % (len(questions), nempty))
    return not bad


# ---------------------------------------------------------------- 24〜25. 用語集（段階6-22）

TERM_KEYS = ["term_id", "headword", "aliases", "kind", "category", "description", "related"]


def load_glossary():
    path = DATA / "glossary.json"
    if not path.exists():
        record("24. glossary.json が読めて、決めた形になっている", False, "glossary.json がない")
        return None
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception as exc:
        record("24. glossary.json が読めて、決めた形になっている", False, "読めない: %s" % exc)
        return None


def check_glossary_shape(glossary, categories):
    bad = []
    if set(glossary) != {"meta", "terms", "card_terms", "question_terms"}:
        bad.append("項目が meta・terms・card_terms・question_terms でない: %s" % sorted(glossary))
        record("24. glossary.json が読めて、決めた形になっている", False, fail_detail(bad))
        return False
    meta = glossary["meta"]
    if not (isinstance(meta, dict) and isinstance(meta.get("generated_at"), str)
            and isinstance(meta.get("source"), dict)):
        bad.append("meta に generated_at・source がない")
    terms = glossary["terms"]
    names = {c["name"] for c in categories}
    ids = set()
    if not isinstance(terms, list) or not terms:
        bad.append("terms が空か配列でない")
        terms = []
    for t in terms:
        if not isinstance(t, dict) or sorted(t) != sorted(TERM_KEYS):
            bad.append("terms の項目が %s でない: %s" % (TERM_KEYS, t.get("term_id") if isinstance(t, dict) else t))
            continue
        tid = t["term_id"]
        if not isinstance(tid, str) or not tid or tid in ids:
            bad.append("%s:term_id が文字列でないか重なっている" % tid)
        ids.add(tid)
        for key in ("headword", "description", "kind"):
            if not isinstance(t[key], str) or not t[key].strip():
                bad.append("%s:%s が空" % (tid, key))
        if t["category"] not in names:
            bad.append("%s:category %s が分野の名前でない" % (tid, t["category"]))
        if not (isinstance(t["aliases"], list) and all(isinstance(x, str) and x for x in t["aliases"])):
            bad.append("%s:aliases が文字列の配列でない" % tid)
        if not (isinstance(t["related"], list) and all(isinstance(x, str) for x in t["related"])):
            bad.append("%s:related が文字列の配列でない" % tid)
    for t in terms:
        if isinstance(t, dict) and isinstance(t.get("related"), list):
            for r in t["related"]:
                if r not in ids:
                    bad.append("%s:related の %s が terms にない" % (t["term_id"], r))
                if r == t["term_id"]:
                    bad.append("%s:related に自分がある" % r)
    record("24. glossary.json が読めて、決めた形になっている（terms の項目・分野の名前・関係する用語がある）",
           not bad, fail_detail(bad) or "用語 %d" % len(ids))
    return ids if not bad else None


def check_glossary_spans(glossary, ids, questions, cards):
    bad = []
    n = 0
    by_q = {q["id"]: q for q in questions}
    by_c = {c["id"]: c for c in cards}

    def spans(items, text, tag):
        nonlocal n
        if not isinstance(items, list):
            bad.append("%s:配列でない" % tag)
            return
        last_end = 0
        for x in sorted(items, key=lambda y: y.get("start", 0) if isinstance(y, dict) else 0):
            n += 1
            if not isinstance(x, dict) or sorted(x) != ["end", "start", "term_id", "text"]:
                bad.append("%s:当たりの項目が term_id・start・end・text でない" % tag)
                continue
            if x["term_id"] not in ids:
                bad.append("%s:%s が terms にない" % (tag, x["term_id"]))
            if text[x["start"]:x["end"]] != x["text"]:
                bad.append("%s:%s の位置 %d-%d が本文と合わない" % (tag, x["term_id"], x["start"], x["end"]))
            if x["start"] < last_end:
                bad.append("%s:%s の位置が前の当たりと重なっている" % (tag, x["term_id"]))
            last_end = max(last_end, x["end"])

    qt = glossary["question_terms"]
    if set(qt) - set(by_q):
        bad.append("question_terms に問題に無いIDがある: %s" % sorted(set(qt) - set(by_q))[:5])
    for qid, v in qt.items():
        q = by_q.get(qid)
        if q is None:
            continue
        if not isinstance(v, dict) or sorted(v) != ["choices", "text"]:
            bad.append("%s:question_terms の項目が text・choices でない" % qid)
            continue
        spans(v["text"], q["text"], qid + "/text")
        by_label = {ch["label"]: ch["text"] for ch in q["choices"]}
        if not isinstance(v["choices"], dict):
            bad.append("%s:choices が辞書でない" % qid)
            continue
        for label, items in v["choices"].items():
            if label not in by_label:
                bad.append("%s:choices の記号 %s が選択肢にない" % (qid, label))
                continue
            spans(items, by_label[label], "%s/%s" % (qid, label))
    ct = glossary["card_terms"]
    if set(ct) - set(by_c):
        bad.append("card_terms にカードに無いIDがある: %s" % sorted(set(ct) - set(by_c))[:5])
    for cid, v in ct.items():
        c = by_c.get(cid)
        if c is None:
            continue
        if not isinstance(v, dict) or sorted(v) != ["back", "front"]:
            bad.append("%s:card_terms の項目が front・back でない" % cid)
            continue
        spans(v["front"], c["front"], cid + "/front")
        spans(v["back"], c["back"], cid + "/back")
    record("25. glossary.json の当たりの位置（question_terms の text・choices、card_terms の front・back）が、"
           "問題文・選択肢・カードの表と答えのその位置にそのままあり、重ならない",
           not bad, fail_detail(bad) or "当たり %d（問題 %d・カード %d）" % (n, len(qt), len(ct)))
    return not bad


# ---------------------------------------------------------------- 実行

def main():
    docs, shape_ok = check_shape()
    if not shape_ok:
        for name, ok, detail in results:
            print("[%s] %s%s" % ("OK" if ok else "NG", name, ("  -> " + detail) if detail else ""))
        print("形が違うため、ここで止める。")
        return 1

    questions = docs["questions.json"]["questions"]
    cards = docs["cards.json"]["cards"]
    categories = docs["curriculum.json"]["categories"]

    check_counts(questions, cards)
    check_references(questions, cards, categories)
    check_order(questions, cards, categories)
    check_choices(questions)
    check_highlight_range(questions, cards)
    check_pass_score(categories)
    check_banned()
    check_links_content(questions, cards)
    check_link_types(questions, cards)
    check_roles(questions)
    check_question_highlights(questions)
    check_unit_card_list(questions, categories)
    check_empty_units(categories)
    check_excluded(questions, categories)
    check_weak_questions()
    check_back_note_words(cards)
    check_check_choices(cards)
    check_contrast_pairs(questions, cards)
    check_explanations(questions)
    glossary = load_glossary()
    if glossary is not None:
        ids = check_glossary_shape(glossary, categories)
        if ids:
            check_glossary_spans(glossary, ids, questions, cards)
    check_version_stamp()

    for name, ok, detail in results:
        print("[%s] %s%s" % ("OK" if ok else "NG", name, ("  -> " + detail) if detail else ""))
    ng = [name for name, ok, _ in results if not ok]
    print("---")
    print("確かめた項目 %d / 通った %d / 通らなかった %d"
          % (len(results), len(results) - len(ng), len(ng)))
    return 0 if not ng else 1


# ---------------------------------------------------------------- 30. 版の番号（段階6-22b）

def check_version_stamp():
    name = "30. 版の番号が、今の中身から計算した番号になっている（tools/stamp_version.py --check）"
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    sys.dont_write_bytecode = True  # app/ に __pycache__ を作らない
    import stamp_version
    number = stamp_version.compute_number()
    problems = stamp_version.check_problems(number)
    record(name, not problems,
           fail_detail(problems) + "（app/ で python3 tools/stamp_version.py を動かす）" if problems
           else "番号 %s" % number)
    return not problems


if __name__ == "__main__":
    sys.exit(main())
