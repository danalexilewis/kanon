---
schema: eddy-review/v1
doc:
  id: circles-of-trust-km-review-2026-10-11
  title: Circles of trust — a knowledge-management review
  kind: derivative
  status: proposed
  reviewed_at: 2026-10-11
---

# Circles of trust — a knowledge-management review

Review — 11 October 2026

This page records why ingest uses nested circles rather than one repo per
Drive folder. It is not a spec. The spec lives in
[ADR 0008](../decisions/0008-circles-of-trust.md) and
[plans/20261011-circles-of-trust.md](../../plans/20261011-circles-of-trust.md).

## The failure that forced the choice

A Drive folder of meeting notes was ingested into one Git source. Each
note had its own sharing list. The repository did not. Readers who were
not on a note's Drive sharing could open it through Git. A second run
would have copied the rest of the folder. Frontmatter cannot protect a
file once it is in a repo.

## Why circles

Knowledge is volunteered; it is not conscripted (Snowden, *Rendering
Knowledge*). Sharing starts with a small group and may later reach a
wider one (Jarche, seek–sense–share). Human groups form hierarchically
inclusive circles (Dunbar). A mixed space hides the real audience
(Garfield on extranets). Search that outruns permission is the failure
mode Microsoft's Copilot oversharing guidance and Glean's
source-permission model both describe.

Private by default, shared on purpose (Forte). Write for yourself first
and opt in to an audience (Matuschak). What teams lose when knowledge
sits in private databases is addressable, permissioned, searchable
material (Rao; Appleton).

Traffic Light Protocol 2.0 is a four-band audience label. Bell–LaPadula's
star property is the write-down guard: do not copy a narrow note into a
wide checkout. Circles are those bands as repositories, not as labels
inside one repository.

## Objections, and the answers in this design

Drive sharing is a noisy guide to intent. Gemini notes are shared with
the invite list. Sensitivity levels and review gates sit on top of
sharing.

Transcripts write down what nobody chose to put on paper (Snowden;
Matuschak on self-censoring). Hard conversations score high. Telling
staff that notes are ingested is a team norm, not something code can do.

Walls breed silos (Milton; Wenger; Davenport, Eccles and Prusak on
feudalism). The review list keeps narrow material visible to the
operator, with a recorded way to promote it.

Real audiences overlap rather than nest (Dunbar). A note lands in the
widest circle whose members can all read it. The me circle takes the
rest. Held should mean exclusions, not leftovers.

Git history cannot unshare. Indexing changes the character of a space
(Appleton quoting Strickler on depressurized conversation). Review
before a wide circle; warn when a document narrows; purge history by
runbook.

A cloud model sees the content. It is opt-in per job, sees only
candidates for the wide circles, should use a zero-retention provider,
never runs on a schedule, and cannot lower a level.

Drive permissions, limited-access folders, and Gemini's default sharing
are implementation facts, not KM theory. They decide how `resolveReaders`
treats a grant. Hosted GitHub collaborator checks are Later.

## Sources

- Snowden, <https://thecynefin.co/rendering-knowledge/>
- Jarche, <https://jarche.com/2014/02/the-seek-sense-share-framework/>
- Milton, <http://www.nickmilton.com/2016/11/how-to-resolve-conflict-between.html>
- Garfield, <https://www.linkedin.com/pulse/external-access-extranets-stan-garfield>
- Nonaka and Konno, <https://cmr.berkeley.edu/1998/05/40-3-the-concept-of-ba-building-a-foundation-for-knowledge-creation/>
- Davenport, Eccles and Prusak, <https://sloanreview.mit.edu/article/information-politics/>
- Prusak, <https://hbr.org/2011/07/one-thing-that-makes-collaboration>
- Wenger, <https://www.wenger-trayner.com/wp-content/uploads/2022/06/1998-EWT-Article-for-the-Systems-Thinker.pdf>
- Forte, <https://fortelabs.com/blog/team-knowledge-management-how-to-use-para-in-your-organization/>
- Matuschak, <https://notes.andymatuschak.org/zXDPrYcxUSZbF5M8vM5Y1U9>
- Rao, <https://contraptions.venkateshrao.com/p/the-extended-internet-universe>
- Appleton, <https://maggieappleton.com/forest-talk>
- Dunbar, <https://www.thebritishacademy.ac.uk/documents/757/06-dunbar.pdf>
- TLP 2.0, <https://www.first.org/tlp/>
- Bell–LaPadula, <https://en.wikipedia.org/wiki/Bell%E2%80%93LaPadula_model>
- Copilot oversharing, <https://learn.microsoft.com/en-us/copilot/microsoft-365/microsoft-365-copilot-blueprint-oversharing>
- Glean, <https://docs.glean.com/security/security-principles>
- Drive permissions, <https://developers.google.com/drive/api/reference/rest/v3/permissions>
- Drive permissions list, <https://developers.google.com/drive/api/reference/rest/v3/permissions/list>
- Drive limited access, <https://developers.google.com/workspace/drive/api/guides/limited-expansive-access>
- Gemini notes sharing, <https://support.google.com/meet/answer/14754931>
- Gemini notes admin default, <https://workspaceupdates.googleblog.com/2026/01/take-notes-for-me-meet-admin-settings.html>
- GitHub collaborators, <https://docs.github.com/en/rest/collaborators/collaborators?apiVersion=2022-11-28>
- GitHub base permissions, <https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/setting-base-permissions-for-an-organization>
