/**
 * The Connect mockups' nearby centres, for development builds only. They let the Connect tab's
 * carousel, Nearby CSC Centers and a centre's details be reviewed with something in them before
 * centre search exists. The Connect routes never show them in a production build.
 *
 * Sample data: the names, addresses, distances, hours and phone number are the mockups'
 * placeholders, not a directory listing — the app never dials the number. Each centre is placed
 * on the map from its distance and a made-up compass bearing around the town's middle, and the
 * photo is the app's own CSC illustration.
 *
 * A `.tsx` file only because Metro resolves image assets through `require()`, which the lint
 * config allows under `components/**\/*.tsx`.
 */

import type {
  NearbyCentre,
  NearbyCentres,
  OpeningHours,
  SearchArea,
} from '../../lib/connect/connect-screen';
import { offsetCoordinates } from '../../lib/connect/nearby-search';

const AREA: SearchArea = {
  label: 'Arrah, Bhojpur, Bihar',
  origin: { latitude: 25.556, longitude: 84.663 },
};

const WEEKDAYS_9_TO_6: OpeningHours = {
  firstDay: 'mon',
  lastDay: 'sat',
  opens: '09:00',
  closes: '18:00',
};

type DemoCentre = Omit<NearbyCentre, 'coordinates' | 'photos' | 'region'> & {
  readonly bearingDegrees: number;
  readonly hasPhoto: boolean;
};

const CENTRES: readonly DemoCentre[] = [
  {
    id: 'demo-csc-main',
    name: 'Arrah Main CSC Center',
    address: 'Near Bus Stand, Arrah, Bhojpur',
    distanceMeters: 1200,
    bearingDegrees: 40,
    openNow: true,
    offerings: [
      'form_filling',
      'document_upload',
      'aadhaar',
      'pan',
      'voter_id',
      'pension',
      'scholarship',
      'caste_certificate',
    ],
    hours: WEEKDAYS_9_TO_6,
    phone: '+91 98765 43210',
    verified: true,
    hasPhoto: true,
  },
  {
    id: 'demo-csc-narayapur',
    name: 'Narayapur CSC Center',
    address: 'Narayapur, Arrah, Bhojpur',
    distanceMeters: 2800,
    bearingDegrees: 200,
    openNow: true,
    offerings: ['pan', 'voter_id', 'scholarship', 'ration_card', 'bill_payment'],
    hours: { firstDay: 'mon', lastDay: 'fri', opens: '10:00', closes: '17:30' },
    phone: null,
    verified: true,
    hasPhoto: true,
  },
  {
    id: 'demo-csc-koilwar',
    name: 'Koilwar Road CSC Center',
    address: 'Koilwar Road, Arrah, Bhojpur',
    distanceMeters: 3600,
    bearingDegrees: 75,
    openNow: false,
    offerings: ['form_filling', 'caste_certificate', 'pension'],
    hours: WEEKDAYS_9_TO_6,
    phone: null,
    verified: false,
    hasPhoto: true,
  },
  {
    id: 'demo-csc-jagdishpur',
    name: 'Jagdishpur Road CSC Center',
    address: 'Jagdishpur Road, Arrah, Bhojpur',
    distanceMeters: 7400,
    bearingDegrees: 255,
    openNow: true,
    offerings: ['aadhaar', 'certificates', 'scholarship'],
    hours: null,
    phone: null,
    verified: true,
    hasPhoto: false,
  },
  {
    id: 'demo-csc-gidha',
    name: 'Gidha CSC Center',
    address: 'Gidha, Arrah, Bhojpur',
    distanceMeters: 9100,
    bearingDegrees: 110,
    openNow: false,
    offerings: ['form_filling', 'bill_payment'],
    hours: WEEKDAYS_9_TO_6,
    phone: null,
    verified: false,
    hasPhoto: false,
  },
];

export function demoNearbyCentres(): NearbyCentres {
  const photo = require('../../assets/home/csc-kiosk-banner.jpg');

  return {
    status: 'ready',
    area: AREA,
    centres: CENTRES.map(({ bearingDegrees, hasPhoto, ...centre }) => ({
      ...centre,
      region: 'Bhojpur, Bihar',
      coordinates: offsetCoordinates(AREA.origin, centre.distanceMeters, bearingDegrees),
      photos: hasPhoto ? [photo] : [],
    })),
  };
}
