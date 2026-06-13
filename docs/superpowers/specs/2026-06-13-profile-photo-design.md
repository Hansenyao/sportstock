# Profile Photo Design

**Date:** 2026-06-13  
**Status:** Approved

---

## Goal

Add optional profile photo support for clubs and users. Photos are stored in the existing Supabase bucket alongside asset images. Club logo upload wires up the already-complete backend endpoint. User avatar is a full-stack addition.

---

## Scope

| Feature | Backend | Frontend |
|---------|---------|----------|
| Club logo upload | Already done (`PUT /clubs/me/logo`) | `uploadLogo()` + UI in ClubInfoSection |
| User avatar upload | New (`PUT /users/me/avatar`) | `uploadMyAvatar()` + UI in Profile |
| Avatar in user list | `avatar_url` on `UserListItem` DTO | Avatar column in Users table |
| Avatar in loans | `coach_avatar_url` on `LoanResponse` | Coach avatar in Loans table row |
| Avatar in `/auth/me` | `avatar_url` on `MeResult` | `MeResult` type updated |

---

## Architecture

### Storage Paths

| Resource | Path |
|----------|------|
| Club logo | `clubs/{clubId}/logo_{timestampMs}.{ext}` (existing) |
| User avatar | `avatars/{clubId}/{userId}_{timestampMs}.{ext}` |

### Endpoint

```
PUT /api/v1/users/me/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data
Body: avatar (IFormFile, max 5 MB)
Response: { "avatar_url": "https://..." }
```

Any authenticated club member may upload their own avatar. No admin-only restriction — consistent with self-service profile editing.

---

## Backend Changes

### DB

Add `avatar_url VARCHAR(255)` to `users` table:
- `db-init.sql`: add column to `CREATE TABLE users`
- `api/migrations/2026-06-13-user-avatar.sql`: live `ALTER TABLE` migration

### Entities + EF

- `User.cs`: add `public string? AvatarUrl { get; set; }`
- `SportStockDbContext.cs`: add `entity.Property(e => e.AvatarUrl).HasColumnName("avatar_url").HasMaxLength(255);`

### DTOs

| File | Change |
|------|--------|
| `MeResult.cs` | Add `string? AvatarUrl` |
| `UserListItem.cs` | Add `string? AvatarUrl` |
| `UserDetailResponse.cs` | Add `string? AvatarUrl` |
| `LoanResponse.cs` | Add `string? CoachAvatarUrl` |
| `UploadAvatarResponse.cs` | New: `{ string AvatarUrl }` |

### Services

**`IUserService`** — add:
```csharp
Task<UploadAvatarResponse> UploadAvatarAsync(
    Guid userId, Guid clubId, Stream content,
    string contentType, string fileName, CancellationToken ct = default);
```

**`UserService`** — implement `UploadAvatarAsync`:
- Path: `avatars/{clubId}/{userId}_{ts}.{ext}`
- Upload via `ISupabaseStorage`
- `ExecuteUpdateAsync` on `Users` setting `AvatarUrl`
- Update projections in `ListAsync` and `GetAsync` to include `AvatarUrl`

**`AuthService.GetMeAsync`** — add `AvatarUrl = user.AvatarUrl` to `MeResult` projection.

**`LoanService`** — add `CoachAvatarUrl = l.Coach.AvatarUrl` to `LoanProjection`.

### Controller

`UsersController.cs` — add:
```csharp
[HttpPut("me/avatar")]
[Authorize]
[RequestSizeLimit(5 * 1024 * 1024)]
public async Task<IActionResult> UploadAvatar(IFormFile? avatar, ...)
```

---

## Frontend Changes

### API Layer

| File | Change |
|------|--------|
| `web/src/types/index.ts` | Add `avatar_url?` to `MeResult` |
| `web/src/api/users.ts` | Add `avatar_url?` to `ClubUser`; add `uploadMyAvatar(file)` |
| `web/src/api/clubs.ts` | Add `uploadLogo(file)` |
| `web/src/api/loans.ts` | Add `coach_avatar_url?` to `Loan` |

### UI

**`ClubInfoSection.tsx`** — in edit mode, show club logo preview with an Upload overlay button. On save, if a new file was selected, call `uploadLogo()` after `updateMyClub()`.

**`Profile/index.tsx`** — above the name fields, show a circular avatar with an edit icon overlay in edit mode. Selecting a file previews it immediately; uploading calls `uploadMyAvatar()` on save.

**`Users/index.tsx`** — add a 32px Avatar as the first column (before Name) in the users table. Falls back to initials when no photo.

**`Loans/index.tsx`** — in the main table Loan column, show a 24px avatar next to the coach name.

---

## Constraints

- File size limit: 5 MB (consistent with club logo)
- Image-only validation handled by content-type check on frontend (Ant Design Upload `accept="image/*"`)
- No server-side image resizing — raw upload, same as asset images
- Upload failure is non-fatal: show a warning toast, keep other saves intact
