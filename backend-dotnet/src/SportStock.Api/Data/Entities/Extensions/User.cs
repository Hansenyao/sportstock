using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data.Entities;

// Adds the `role` column (PG enum `user_role`) that EF Core Power Tools
// silently dropped during reverse engineering. Do not merge into the
// auto-generated User.cs — that file is regenerated on schema refresh.
public partial class User
{
    public UserRole Role { get; set; }
}
