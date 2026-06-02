#nullable enable
using System;
using System.Collections.Generic;

namespace SportStock.Api.Data.Entities;

public partial class SportType
{
    public Guid Id { get; set; }
    public string Name { get; set; } = null!;
    public bool IsActive { get; set; }
    public int SortOrder { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }

    public virtual ICollection<Club> Clubs { get; set; } = new List<Club>();
}
