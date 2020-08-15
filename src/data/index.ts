import {IDataset} from './IDataset';
import {wur, shanghai} from './wur';
import forbes from './forbes-top-2000-companies';
import happiness from './world-happiness-report';
import soccer from './soccer';
import {ieeeheat, ieeebars} from './ieee-programming';
import {simple, big} from './simple';
import {listDatasets, listSessions} from './db';
import JSON_LOADER from './loader_json';
import CSV_LOADER from './loader_csv';
import {IDatasetMeta, PRELOADED_TYPE} from './IDataset';

export * from './IDataset';
export * from './ui';

const preloaded: IDataset[] = [
  soccer,
  wur,
  shanghai,
  forbes,
  happiness,
  ieeebars,
  ieeeheat,
  simple,
  big
];


const loaders = [JSON_LOADER, CSV_LOADER];

function complete(db: IDataset | IDatasetMeta) {
  if (typeof (<IDataset>db).build === 'function') {
    return <IDataset>db;
  }

  for (const loader of loaders) {
    if (db.type === loader.type) {
      return loader.complete(db);
    }
  }

  if (db.type.startsWith(PRELOADED_TYPE)) {
    const id = db.type.slice(PRELOADED_TYPE.length + 1); // for -
    const preloadedDataset = preloaded.find((d) => d.id === id);
    if (preloadedDataset) {
      return Object.assign(db, {
        buildScript: preloadedDataset.buildScript,
        build: preloadedDataset.build,
        rawData: preloadedDataset.rawData
      });
    }
  }
  return <IDataset>db;
}

export function fromFile(file: File): Promise<IDataset> {
  for (const loader of loaders) {
    if (loader.supports(file)) {
      return loader.loadFile(file).then(complete);
    }
  }
  return Promise.reject(`Unknown file type: ${file.name}`);
}

export function checkFiles(files: File[]): Promise<IDataset> {
  const jsonFile = files.filter((f) => JSON_LOADER.supports(f));
  const csvFile = files.filter((f) => CSV_LOADER.supports(f));

  if(jsonFile.length !== 1 || csvFile.length !== 1) {
    return Promise.reject('Wrong file types! Requires config JSON *and* dataset as CSV file.');
  }

  return Promise.all([
      JSON_LOADER.loadFile(jsonFile[0]),
      CSV_LOADER.loadFile(csvFile[0])
    ])
    .then((d) => {
      const jsonDataset = d[0];
      const csvDataset = d[1];
      // merge the JSON dump (ranking configuration) with the raw CSV data
      jsonDataset.rawData = csvDataset.rawData;
      return jsonDataset; // use the merged JSON dataset
    })
    .then(complete);
}

export function allDatasets() {
  return Promise.all([listDatasets(), listSessions()]).then(([ds, sessions]) => {
    const full = <IDataset[]>ds.map(complete).filter((d) => d != null);
    const data = preloaded.concat(full);

    // insert sessions
    for (const d of data) {
      d.sessions = sessions.filter((s) => s.dataset === d.id);
    }

    return data;
  });
}
