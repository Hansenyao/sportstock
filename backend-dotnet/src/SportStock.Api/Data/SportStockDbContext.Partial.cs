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
        modelBuilder.HasPostgresEnum<UserRole>(name: "user_role", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<AssetStatus>(name: "asset_status", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<LoanStatus>(name: "loan_status", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<WriteOffSource>(name: "write_off_source", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<StockMovementType>(name: "stock_movement_type", nameTranslator: snake);
        modelBuilder.HasPostgresEnum<NotificationType>(name: "notification_type", nameTranslator: snake);

        // PG enum columns dropped by EF Core Power Tools — see Data/Entities/Extensions/*.
        modelBuilder.Entity<User>()
            .Property(u => u.Role).HasColumnName("role").HasColumnType("user_role");

        modelBuilder.Entity<AssetBatch>()
            .Property(b => b.Status).HasColumnName("status").HasColumnType("asset_status");

        modelBuilder.Entity<Loan>()
            .Property(l => l.Status).HasColumnName("status").HasColumnType("loan_status");

        modelBuilder.Entity<WriteOffOrder>()
            .Property(w => w.Source).HasColumnName("source").HasColumnType("write_off_source");

        modelBuilder.Entity<StockMovement>()
            .Property(s => s.Type).HasColumnName("type").HasColumnType("stock_movement_type");

        modelBuilder.Entity<Notification>()
            .Property(n => n.Type).HasColumnName("type").HasColumnType("notification_type");

        // Keyless result row for the get_asset_depreciation(batch_id) function.
        modelBuilder.Entity<AssetDepreciationRow>().HasNoKey().ToView(null);
    }
}
