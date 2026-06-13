# Profile Photo Implementation Plan

> **Spec:** `docs/superpowers/specs/2026-06-13-profile-photo-design.md`

---

## Task 1: DB — add avatar_url to users

**Files:**
- Modify: `api/db-init.sql`
- Create: `api/migrations/2026-06-13-user-avatar.sql`

- [ ] **Step 1: Update db-init.sql**

In the `CREATE TABLE users` block, add `avatar_url` after `phone`:

```sql
CREATE TABLE users (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    email          VARCHAR(255) NOT NULL UNIQUE,
    password_hash  TEXT         NOT NULL,
    first_name     VARCHAR(100) NOT NULL,
    last_name      VARCHAR(100) NOT NULL,
    phone          VARCHAR(50),
    avatar_url     VARCHAR(255),
    is_super_admin BOOLEAN      NOT NULL DEFAULT false,
    email_verified BOOLEAN      NOT NULL DEFAULT false,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
```

- [ ] **Step 2: Write migration script**

Create `api/migrations/2026-06-13-user-avatar.sql`:

```sql
-- Migration: add avatar_url to users
-- Apply once to the live Azure DB via psql or SQL client.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(255);
```

- [ ] **Step 3: Commit**

```bash
git add api/db-init.sql api/migrations/2026-06-13-user-avatar.sql
git commit -m "feat(db): add avatar_url to users"
```

---

## Task 2: Backend entity + EF mapping

**Files:**
- Modify: `api/src/SportStock.Api/Data/Entities/User.cs`
- Modify: `api/src/SportStock.Api/Data/SportStockDbContext.cs`

- [ ] **Step 1: Add AvatarUrl to User.cs**

After `Phone`:
```csharp
public string? AvatarUrl { get; set; }
```

- [ ] **Step 2: Add EF mapping in SportStockDbContext.cs**

In the `modelBuilder.Entity<User>(entity =>` block, after the `Phone` mapping:
```csharp
entity.Property(e => e.AvatarUrl).HasColumnName("avatar_url").HasMaxLength(255);
```

- [ ] **Step 3: Build**

```bash
cd api && dotnet build src/SportStock.Api/SportStock.Api.csproj
```
Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add api/src/SportStock.Api/Data/Entities/User.cs \
        api/src/SportStock.Api/Data/SportStockDbContext.cs
git commit -m "feat(api): add AvatarUrl to User entity and EF mapping"
```

---

## Task 3: Backend DTOs

**Files:**
- Modify: `api/src/SportStock.Api/Dtos/Auth/MeResult.cs`
- Modify: `api/src/SportStock.Api/Dtos/Users/UserListItem.cs`
- Modify: `api/src/SportStock.Api/Dtos/Users/UserDetailResponse.cs`
- Modify: `api/src/SportStock.Api/Dtos/Loans/LoanResponse.cs`
- Create: `api/src/SportStock.Api/Dtos/Users/UploadAvatarResponse.cs`

- [ ] **Step 1: MeResult.cs — add AvatarUrl after ClubLogo**

```csharp
public string? AvatarUrl { get; set; }
```

- [ ] **Step 2: UserListItem.cs — add AvatarUrl after CreatedAt**

```csharp
public string? AvatarUrl { get; set; }
```

- [ ] **Step 3: UserDetailResponse.cs — add AvatarUrl after CreatedAt**

```csharp
public string? AvatarUrl { get; set; }
```

- [ ] **Step 4: LoanResponse.cs — add CoachAvatarUrl after CoachEmail**

```csharp
public string? CoachAvatarUrl { get; set; }
```

- [ ] **Step 5: Create UploadAvatarResponse.cs**

```csharp
namespace SportStock.Api.Dtos.Users;

public sealed class UploadAvatarResponse
{
    public string AvatarUrl { get; set; } = string.Empty;
}
```

- [ ] **Step 6: Build**

```bash
cd api && dotnet build src/SportStock.Api/SportStock.Api.csproj
```

- [ ] **Step 7: Commit**

```bash
git add api/src/SportStock.Api/Dtos/
git commit -m "feat(api): add avatar fields to user/loan DTOs"
```

---

## Task 4: Backend services — project + upload

**Files:**
- Modify: `api/src/SportStock.Api/Services/IUserService.cs`
- Modify: `api/src/SportStock.Api/Services/UserService.cs`
- Modify: `api/src/SportStock.Api/Services/AuthService.cs`
- Modify: `api/src/SportStock.Api/Services/LoanService.cs`

- [ ] **Step 1: IUserService — add UploadAvatarAsync**

```csharp
Task<UploadAvatarResponse> UploadAvatarAsync(
    Guid userId, Guid clubId, Stream content,
    string contentType, string fileName, CancellationToken ct = default);
```

- [ ] **Step 2: UserService.ListAsync — add AvatarUrl to projection**

In the `new UserListItem { ... }` select, add:
```csharp
AvatarUrl = m.User.AvatarUrl,
```
(two places — both the paginated and full projections)

- [ ] **Step 3: UserService.GetAsync — add AvatarUrl to projection**

In the `new UserDetailResponse { ... }` select, add:
```csharp
AvatarUrl = m.User.AvatarUrl,
```

- [ ] **Step 4: UserService — implement UploadAvatarAsync**

```csharp
public async Task<UploadAvatarResponse> UploadAvatarAsync(
    Guid userId, Guid clubId, Stream content,
    string contentType, string fileName, CancellationToken ct = default)
{
    var ext = Path.GetExtension(fileName).TrimStart('.');
    var path = $"avatars/{clubId}/{userId}_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}.{ext}";
    var url = await _storage.UploadAsync(path, content, contentType, ct);

    await _db.Users
        .Where(u => u.Id == userId)
        .ExecuteUpdateAsync(s => s
            .SetProperty(u => u.AvatarUrl, url)
            .SetProperty(u => u.UpdatedAt, DateTime.UtcNow), ct);

    return new UploadAvatarResponse { AvatarUrl = url };
}
```

- [ ] **Step 5: AuthService.GetMeAsync — add AvatarUrl to MeResult**

In the `return new MeResult { ... }` block, add:
```csharp
AvatarUrl = user.AvatarUrl,
```

- [ ] **Step 6: LoanService.LoanProjection — add CoachAvatarUrl**

In the `LoanProjection` expression (the static `Expression<Func<Loan, LoanResponse>>`), add:
```csharp
CoachAvatarUrl = l.Coach.AvatarUrl,
```

- [ ] **Step 7: Build**

```bash
cd api && dotnet build src/SportStock.Api/SportStock.Api.csproj
```
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add api/src/SportStock.Api/Services/
git commit -m "feat(api): project and upload user avatar"
```

---

## Task 5: Backend controller

**Files:**
- Modify: `api/src/SportStock.Api/Controllers/UsersController.cs`

- [ ] **Step 1: Add UploadAvatar endpoint**

Add to `UsersController`:

```csharp
[HttpPut("me/avatar")]
[Authorize]
[RequestSizeLimit(5 * 1024 * 1024)]
public async Task<IActionResult> UploadAvatar(
    IFormFile? avatar,
    [FromServices] ICurrentUser currentUser,
    CancellationToken ct)
{
    if (avatar is null || avatar.Length == 0)
        throw new AppException("No file provided", 400);
    if (currentUser.ActiveClubId is null)
        throw new AppException("You have not joined a club yet", 404);

    await using var stream = avatar.OpenReadStream();
    var result = await service.UploadAvatarAsync(
        currentUser.UserId, currentUser.ActiveClubId.Value,
        stream, avatar.ContentType, avatar.FileName, ct);
    return Ok(result);
}
```

- [ ] **Step 2: Build**

```bash
cd api && dotnet build src/SportStock.Api/SportStock.Api.csproj
```

- [ ] **Step 3: Commit**

```bash
git add api/src/SportStock.Api/Controllers/UsersController.cs
git commit -m "feat(api): PUT /users/me/avatar endpoint"
```

---

## Task 6: Frontend API layer

**Files:**
- Modify: `web/src/types/index.ts`
- Modify: `web/src/api/users.ts`
- Modify: `web/src/api/clubs.ts`
- Modify: `web/src/api/loans.ts`

- [ ] **Step 1: types/index.ts — add avatar_url to MeResult**

Add after `club_name`:
```ts
avatar_url?: string | null;
```

- [ ] **Step 2: api/users.ts — add avatar_url to ClubUser + uploadMyAvatar**

Add `avatar_url?: string | null` to `ClubUser`.

Add function:
```ts
export const uploadMyAvatar = (file: File) => {
  const form = new FormData();
  form.append('avatar', file);
  return client.put<{ avatar_url: string }>('/users/me/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
```

- [ ] **Step 3: api/clubs.ts — add uploadLogo**

```ts
export const uploadLogo = (file: File) => {
  const form = new FormData();
  form.append('logo', file);
  return client.put<{ logo_url: string }>('/clubs/me/logo', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};
```

- [ ] **Step 4: api/loans.ts — add coach_avatar_url to Loan**

In the `Loan` interface, add after `coach_email`:
```ts
coach_avatar_url?: string | null;
```

- [ ] **Step 5: Commit**

```bash
git add web/src/types/index.ts web/src/api/users.ts web/src/api/clubs.ts web/src/api/loans.ts
git commit -m "feat(web): add avatar API types and upload functions"
```

---

## Task 7: Frontend — Club logo upload UI

**Files:**
- Modify: `web/src/pages/Settings/sections/ClubInfoSection.tsx`

- [ ] **Step 1: Add logo state and upload in ClubInfoSection**

Add `logoFile` and `logoPreview` state. In edit mode, show an Upload component above the form fields. On save, call `uploadLogo()` after `updateMyClub()` if a file was selected.

Key pattern (mirrors asset image upload):
```tsx
const [logoFile, setLogoFile] = useState<File | null>(null);
const [logoPreview, setLogoPreview] = useState<string | null>(club?.logo_url ?? null);

// In the JSX (edit mode only):
<Upload
  accept="image/*"
  showUploadList={false}
  beforeUpload={file => { setLogoFile(file); setLogoPreview(URL.createObjectURL(file)); return false; }}
>
  <div style={{ cursor: 'pointer', position: 'relative', width: 80, height: 80 }}>
    <Avatar size={80} src={logoPreview} icon={<TeamOutlined />} shape="square" />
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', borderRadius: 4,
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <CameraOutlined style={{ color: '#fff', fontSize: 20 }} />
    </div>
  </div>
</Upload>

// In save handler, after updateMyClub():
if (logoFile) {
  await uploadLogo(logoFile).catch(() => message.warning('Info saved, but logo upload failed'));
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Settings/sections/ClubInfoSection.tsx
git commit -m "feat(web): club logo upload UI in settings"
```

---

## Task 8: Frontend — User avatar upload UI (Profile page)

**Files:**
- Modify: `web/src/pages/Profile/index.tsx`

- [ ] **Step 1: Add avatar upload to Profile page**

Add `avatarFile` and `avatarPreview` state. Render a circular Avatar above the form. In edit mode, wrap in an Upload with a camera-icon overlay. On save, call `uploadMyAvatar()` and update the user context if successful.

```tsx
const [avatarFile, setAvatarFile] = useState<File | null>(null);
const [avatarPreview, setAvatarPreview] = useState<string | null>(user?.avatar_url ?? null);

// Avatar JSX:
{isEditing ? (
  <Upload accept="image/*" showUploadList={false}
    beforeUpload={file => { setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file)); return false; }}>
    <div style={{ cursor: 'pointer', position: 'relative', width: 80, height: 80 }}>
      <Avatar size={80} src={avatarPreview} icon={<UserOutlined />} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', borderRadius: '50%',
        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CameraOutlined style={{ color: '#fff', fontSize: 20 }} />
      </div>
    </div>
  </Upload>
) : (
  <Avatar size={80} src={avatarPreview} icon={<UserOutlined />} />
)}

// In save handler, after updateProfile():
if (avatarFile) {
  await uploadMyAvatar(avatarFile).catch(() => message.warning('Profile saved, but avatar upload failed'));
}
```

- [ ] **Step 2: TypeScript compile check**

```bash
cd web && npx tsc --noEmit
```

- [ ] **Step 3: Commit**

```bash
git add web/src/pages/Profile/index.tsx
git commit -m "feat(web): user avatar upload UI in profile page"
```

---

## Task 9: Frontend — Avatar in Users list

**Files:**
- Modify: `web/src/pages/Users/index.tsx`

- [ ] **Step 1: Add avatar column to users table**

Insert a new column before the Name column:

```tsx
{
  title: '',
  key: 'avatar',
  width: 48,
  render: (_: unknown, row: ClubUser) => (
    <Avatar
      size={32}
      src={row.avatar_url ?? undefined}
      style={{ backgroundColor: '#1677ff' }}
    >
      {!row.avatar_url && row.name.charAt(0).toUpperCase()}
    </Avatar>
  ),
},
```

- [ ] **Step 2: TypeScript compile check + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/pages/Users/index.tsx
git commit -m "feat(web): show avatar in users table"
```

---

## Task 10: Frontend — Coach avatar in Loans table

**Files:**
- Modify: `web/src/pages/Loans/index.tsx`

- [ ] **Step 1: Show coach avatar next to coach name in Loans table**

Find the column/render that displays `loan.coach_name` and wrap it in a Flex:

```tsx
// Before (example):
{isMobile ? loan.coach_name : `Borrower: ${loan.coach_name}`}

// After:
<Flex align="center" gap={6}>
  <Avatar size={24} src={loan.coach_avatar_url ?? undefined}
    style={{ flexShrink: 0, backgroundColor: '#1677ff' }}>
    {!loan.coach_avatar_url && loan.coach_name.charAt(0).toUpperCase()}
  </Avatar>
  <span>{isMobile ? loan.coach_name : `Borrower: ${loan.coach_name}`}</span>
</Flex>
```

- [ ] **Step 2: TypeScript compile check + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/pages/Loans/index.tsx
git commit -m "feat(web): show coach avatar in loans table"
```

---

## Self-Review Checklist

- [x] Club logo — backend already done; frontend task 7 wires it up
- [x] User avatar — full stack: tasks 1-5 backend, 6-10 frontend
- [x] Avatar shown in: Profile (T8), Users list (T9), Loans coach (T10), MeResult (T4/T6)
- [x] Upload failure is non-fatal with warning toast
- [x] Storage path: `avatars/{clubId}/{userId}_{ts}.{ext}`
- [x] 5 MB limit on upload endpoint
- [x] No TS errors — compile check in each frontend task
