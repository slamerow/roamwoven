import assert from "node:assert/strict";
import {
  isRedundantLocalAirportTransferCandidate,
  isTravelActionCandidate,
  shouldBeTravelRow,
} from "@/lib/trip-travel-boundary-policy";

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

test("travel boundary keeps real movement and booked transfers as travel rows", () => {
  assert.equal(
    shouldBeTravelRow({
      arrivalLocation: "Vienna",
      departureLocation: "Prague",
      title: "Train to Vienna",
      transportType: "train",
    }),
    true
  );
  assert.equal(
    shouldBeTravelRow({
      arrivalLocation: "Fiumicino Airport",
      confirmationLabel: "ABC123",
      departureLocation: "The RomeHello Hostel",
      provider: "Private airport transfer",
      title: "Private airport transfer",
      transportType: "transfer",
    }),
    true
  );
});

test("travel boundary keeps rental pickups and scenic rides out of travel rows", () => {
  assert.equal(
    shouldBeTravelRow({
      confirmationLabel: "81486",
      description: "Pick up rental car at 9 AM.",
      title: "Pick up rental car for Kutna Hora",
      transportType: "rental_car",
    }),
    false
  );
  assert.equal(
    shouldBeTravelRow({
      description:
        "Panorama Train pass and Ferris wheel are optional Vienna sights.",
      title: "Panorama train and Ferris wheel",
    }),
    false
  );
});

test("travel boundary suppresses ordinary airport moves but not booked ones", () => {
  const ordinaryAirportMove = {
    description:
      "Wake at 6:00 AM to take public transport to Rome Ciampino before the Ryanair flight.",
    title: "Airport transfer to Rome Ciampino",
  };

  assert.equal(isRedundantLocalAirportTransferCandidate(ordinaryAirportMove), true);
  assert.equal(shouldBeTravelRow(ordinaryAirportMove), false);
  assert.equal(
    isRedundantLocalAirportTransferCandidate({
      confirmationLabel: "ABC123",
      provider: "Private airport transfer",
      title: "Private airport transfer to Fiumicino Airport",
      transportType: "transfer",
    }),
    false
  );
});

test("travel boundary still recognizes duplicate transport activities", () => {
  assert.equal(isTravelActionCandidate({ title: "Fly to Rome" }), true);
  assert.equal(
    isTravelActionCandidate({ title: "Pick up rental car for Kutna Hora" }),
    false
  );
  assert.equal(
    isTravelActionCandidate({ title: "Panorama train and Ferris wheel" }),
    false
  );
});
