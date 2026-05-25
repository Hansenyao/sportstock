using Microsoft.EntityFrameworkCore;
using SportStock.Api.Data.Entities;

namespace SportStock.Api.Data;

// Implements the partial method declared at the bottom of the auto-generated
// SportStockDbContext.cs. Add hand-written Fluent configuration here so it
// survives the next Reverse Engineer refresh.
public partial class SportStockDbContext
{
    partial void OnModelCreatingPartial(ModelBuilder modelBuilder)
    {
        // PG enum columns dropped by EF Core Power Tools — see Data/Entities/Extensions/*.
        // C# <-> PG value translation is wired in Program.cs via
        // NpgsqlDataSourceBuilder.MapEnum<T>(name, new NpgsqlSnakeCaseNameTranslator()).
        modelBuilder.Entity<User>()
            .Property(u => u.Role).HasColumnName("role");

        modelBuilder.Entity<AssetBatch>()
            .Property(b => b.Status).HasColumnName("status");

        modelBuilder.Entity<Loan>()
            .Property(l => l.Status).HasColumnName("status");

        modelBuilder.Entity<WriteOffOrder>()
            .Property(w => w.Source).HasColumnName("source");

        modelBuilder.Entity<StockMovement>()
            .Property(s => s.Type).HasColumnName("type");

        modelBuilder.Entity<Notification>()
            .Property(n => n.Type).HasColumnName("type");

        // Keyless result row for the get_asset_depreciation(batch_id) function.
        modelBuilder.Entity<AssetDepreciationRow>().HasNoKey().ToView(null);
    }
}
