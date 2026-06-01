namespace SportStock.Api.Data.Enums;

// Mirrors PostgreSQL enum type `asset_status`.
// PascalCase <-> snake_case translation handled by NpgsqlSnakeCaseNameTranslator
// registered via NpgsqlDataSourceBuilder.MapEnum<T>(...) in Program.cs.
public enum AssetStatus
{
    Available,
    OnLoan,
    Maintenance,
    Retired,
}
