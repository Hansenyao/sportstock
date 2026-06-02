namespace SportStock.Api.Dtos.Auth;

public sealed record RegisterUserResult(Guid Id, string Email, string FirstName, string LastName);
