namespace PmSTools_WASM.Models;

public sealed class DeliveryRoute
{
    public string? Name { get; set; }
    public List<DeliveryRouteStop> Stops { get; set; } = new();

    public DeliveryRouteStop AddStop(DeliveryRouteStop? stop = null)
    {
        var routeStop = stop ?? new DeliveryRouteStop();
        Stops.Add(routeStop);
        RenumberStops();
        return routeStop;
    }

    public bool RemoveStop(DeliveryRouteStop stop)
    {
        if (!Stops.Remove(stop))
        {
            return false;
        }

        RenumberStops();
        return true;
    }

    public void RenumberStops()
    {
        for (var index = 0; index < Stops.Count; index++)
        {
            var stop = Stops[index];
            stop.Order = index + 1;
            stop.IsFirst = index == 0;
            stop.IsLast = index == Stops.Count - 1;
        }
    }

    public DeliveryRouteStop AddStop(PlaceInfoItem place)
    {
        if (place == null)
        {
            throw new ArgumentNullException(nameof(place));
        }

        var stop = new DeliveryRouteStop
        {
            Name = place.Name,
            StreetName = place.StreetName,
            StreetNumber = place.StreetNumber,
            PostalCode = place.PostalCode,
            City = place.City,
            Country = place.Country,
            Latitude = place.Latitude,
            Longitude = place.Longitude
        };

        return AddStop(stop);
    }
}
