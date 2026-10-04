# Open-source license proposal

The user requested a reusable open-source agenda. The implementation is in the existing public repository; a public repository alone does not grant an open-source license. No license or copyright holder has been invented or applied, and no separate repository/package was created.

Candidate: **MIT for the original agenda implementation and documentation**, subject to the owner's selection and confirmed copyright attribution. Its short permissive terms permit reuse and modification while requiring preservation of the copyright/license notice. [Authoritative MIT text](https://opensource.org/license/mit), checked 2026-10-04.

Alternative: **Apache-2.0**, if the owner prefers its explicit contributor patent grant and associated redistribution/notice requirements. [Authoritative Apache text](https://www.apache.org/licenses/LICENSE-2.0), checked 2026-10-04. This proposal is a choice for the owner, not an applied legal grant.

The agenda has no runtime npm dependency. It uses standard Web APIs, TypeScript source and Node's built-in SQLite adapter for local execution. The two added development dependencies are pinned `typescript@7.0.2` (Apache-2.0) and `@types/node@24.19.1` (MIT), as declared in their installed package metadata. Preserve their notices if redistributed. Existing test/build dependencies retain their own licenses and are not relicensed by this proposal.

Scope excludes business photographs, generated derivatives, real review quotations, names/branding and local fonts. Those are not part of a generic agenda extraction or covered by an original-code license. The website's existing font OFL files and upstream component notices remain intact. Before extraction, record the selected license, actual owner attribution, distribution scope and retained third-party notices. No personal data, configuration secrets or private backup belongs in that distribution.
