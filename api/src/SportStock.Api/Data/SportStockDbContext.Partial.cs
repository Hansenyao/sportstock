using Microsoft.EntityFrameworkCore;
using Npgsql.NameTranslation;
using SportStock.Api.Data.Entities;
using SportStock.Api.Data.Enums;

namespace SportStock.Api.Data;

// Implements the partial method declared at the bottom of the auto-generated
// SportStockDbContext.cs. Add hand-written Fluent configuration here so it
// survives the next Reverse Engineer refresh.
public partial class SportStockDbContext
{
    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        // Link each C# enum to its PostgreSQL enum. Three layers required:
        //   1. NpgsqlDataSourceBuilder.MapEnum<T>(name, snake) in Program.cs
        //      — handles wire-level serialization via Npgsql.
        //   2. modelBuilder.HasPostgresEnum<T>(...) here — registers the
        //      enum at the EF Core model level so it knows the PG type exists.
        //   3. .HasColumnType("<enum_name>") on each enum-typed property —
        //      tells EF Core which PG type a specific column uses
        //      (auto-detection via convention is unreliable in EFCore 10).
        var snake = new NpgsqlSnakeCaseNameTranslator();
        modelBuilder.HasPostgresEnum<ClubRole>(name: "club_role", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<AssetItemStatus>(name: "asset_item_status", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<LoanStatus>(name: "loan_status", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<WriteOffSource>(name: "write_off_source", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<StockMovementType>(name: "stock_movement_type", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<NotificationType>(name: "notification_type", nameTranslator: snake);

        // User.IsSupAdmin maps to is_super_admin (snake_case would produce is_sup_admin)
        modelBuilder.Entity<User>()
            .Property(u => u.IsSupAdmin).HasColumnName("is_super_admin");

        // Club.SportType ↔ SportType.Clubs — tie the two ends together so EF Core
        // doesn't create a shadow FK SportTypeId1 alongside the real sport_type_id.
        modelBuilder.Entity<Club>()
            .HasOne(c => c.SportType)
            .WithMany(s => s.Clubs)
            .HasForeignKey(c => c.SportTypeId)
            .OnDelete(DeleteBehavior.SetNull);

        // Club.Owner — single nav, no inverse on User
        modelBuilder.Entity<Club>()
            .HasOne(c => c.Owner)
            .WithMany()
            .HasForeignKey(c => c.OwnerId)
            .OnDelete(DeleteBehavior.SetNull);

        // Table + column mappings for v2 entities.
        // The auto-generated context uses explicit ToTable + HasColumnName everywhere;
        // new entities must follow the same pattern or EF Core uses PascalCase names.
        modelBuilder.Entity<ClubMembership>(e =>
        {
            e.ToTable("club_memberships");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ClubId).HasColumnName("club_id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Role).HasColumnName("role").HasColumnType("club_role");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.InvitedBy).HasColumnName("invited_by");
            e.Property(x => x.JoinedAt).HasColumnName("joined_at");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<ClubInvitation>(e =>
        {
            e.ToTable("club_invitations");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ClubId).HasColumnName("club_id");
            e.Property(x => x.InviteeId).HasColumnName("invitee_id");
            e.Property(x => x.InvitedById).HasColumnName("invited_by");
            e.Property(x => x.Role).HasColumnName("role").HasColumnType("club_role");
            e.Property(x => x.Status).HasColumnName("status");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.RespondedAt).HasColumnName("responded_at");
        });

        modelBuilder.Entity<SportType>(e =>
        {
            e.ToTable("sport_types");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.SortOrder).HasColumnName("sort_order");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<Warehouse>(e =>
        {
            e.ToTable("warehouses");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ClubId).HasColumnName("club_id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.Description).HasColumnName("description");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<AssetItem>(e =>
        {
            e.ToTable("asset_items");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ClubId).HasColumnName("club_id");
            e.Property(x => x.AssetTypeId).HasColumnName("asset_type_id");
            e.Property(x => x.BatchId).HasColumnName("batch_id");
            e.Property(x => x.WarehouseId).HasColumnName("warehouse_id");
            e.Property(x => x.SerialNumber).HasColumnName("serial_number");
            e.Property(x => x.Status).HasColumnName("status").HasColumnType("asset_item_status");
            e.Property(x => x.Notes).HasColumnName("notes");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<LoanItemAssignment>(e =>
        {
            e.ToTable("loan_item_assignments");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.LoanItemId).HasColumnName("loan_item_id");
            e.Property(x => x.AssetItemId).HasColumnName("asset_item_id");
            e.Property(x => x.AssignedAt).HasColumnName("assigned_at");
        });

        modelBuilder.Entity<AuditLog>(e =>
        {
            e.ToTable("audit_logs");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ClubId).HasColumnName("club_id");
            e.Property(x => x.UserId).HasColumnName("user_id");
            e.Property(x => x.Action).HasColumnName("action");
            e.Property(x => x.EntityType).HasColumnName("entity_type");
            e.Property(x => x.EntityId).HasColumnName("entity_id");
            e.Property(x => x.Meta).HasColumnName("meta").HasColumnType("jsonb");
            e.Property(x => x.IpAddress).HasColumnName("ip_address");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
        });

        modelBuilder.Entity<Kit>(e =>
        {
            e.ToTable("kits");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.ClubId).HasColumnName("club_id");
            e.Property(x => x.Name).HasColumnName("name");
            e.Property(x => x.Description).HasColumnName("description");
            e.Property(x => x.IsActive).HasColumnName("is_active");
            e.Property(x => x.CreatedBy).HasColumnName("created_by");
            e.Property(x => x.CreatedAt).HasColumnName("created_at");
            e.Property(x => x.UpdatedAt).HasColumnName("updated_at");
        });

        modelBuilder.Entity<KitItem>(e =>
        {
            e.ToTable("kit_items");
            e.Property(x => x.Id).HasColumnName("id");
            e.Property(x => x.KitId).HasColumnName("kit_id");
            e.Property(x => x.AssetTypeId).HasColumnName("asset_type_id");
            e.Property(x => x.Quantity).HasColumnName("quantity");
        });

        // PG enum columns dropped by EF Core Power Tools — see Data/Entities/Extensions/*.
        modelBuilder.Entity<ClubMembership>()
            .Property(m => m.Role).HasColumnName("role").HasColumnType("club_role");

        modelBuilder.Entity<ClubInvitation>()
            .Property(i => i.Role).HasColumnName("role").HasColumnType("club_role");

        modelBuilder.Entity<AssetItem>()
            .Property(a => a.Status).HasColumnName("status").HasColumnType("asset_item_status");

        modelBuilder.Entity<AuditLog>()
            .Property(a => a.Meta).HasColumnType("jsonb");

        modelBuilder.Entity<Loan>()
            .Property(l => l.Status).HasColumnName("status").HasColumnType("loan_status");

        modelBuilder.Entity<WriteOffOrder>()
            .Property(w => w.Source).HasColumnName("source").HasColumnType("write_off_source");

        modelBuilder.Entity<StockMovement>()
            .Property(s => s.Type).HasColumnName("type").HasColumnType("stock_movement_type");

        modelBuilder.Entity<Notification>()
            .Property(n => n.Type).HasColumnName("type").HasColumnType("notification_type");

        // AssetItem.AssetTypeId → asset_types.id (v2 item-level tracking).
        modelBuilder.Entity<AssetType>()
            .HasMany(t => t.AssetItems)
            .WithOne(i => i.AssetType)
            .HasForeignKey(i => i.AssetTypeId)
            .OnDelete(DeleteBehavior.Cascade);

        // ClubInvitation has two FKs to users (invitee and invited_by).
        modelBuilder.Entity<ClubInvitation>()
            .HasOne(i => i.Invitee).WithMany(u => u.ReceivedInvitations).HasForeignKey(i => i.InviteeId).OnDelete(DeleteBehavior.Cascade);
        modelBuilder.Entity<ClubInvitation>()
            .HasOne(i => i.InvitedBy).WithMany(u => u.SentInvitations).HasForeignKey(i => i.InvitedById).OnDelete(DeleteBehavior.Cascade);

        // Keyless result row for the get_asset_depreciation(batch_id) function.
        // FromSql binds reader columns by name, so the snake_case PG columns
        // returned by the function must be wired to the PascalCase CLR
        // properties — without these explicit mappings, EF Core throws
        // "The required column 'AccumulatedDepreciation' was not present".
        modelBuilder.Entity<AssetDepreciationRow>(b =>
        {
            b.HasNoKey();
            b.ToView(null);
            b.Property(x => x.BatchId).HasColumnName("batch_id");
            b.Property(x => x.AssetTypeId).HasColumnName("asset_type_id");
            b.Property(x => x.PurchasePrice).HasColumnName("purchase_price");
            b.Property(x => x.AnnualDepreciation).HasColumnName("annual_depreciation");
            b.Property(x => x.YearsElapsed).HasColumnName("years_elapsed");
            b.Property(x => x.AccumulatedDepreciation).HasColumnName("accumulated_depreciation");
            b.Property(x => x.NetBookValue).HasColumnName("net_book_value");
        });
    }
}
