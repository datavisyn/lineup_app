import '!file-loader?name=LineUpJS.js!lineupjs/build/LineUpJS.js';
import '!file-loader?name=LineUpJS.css!lineupjs/build/LineUpJS.css';
import '!file-loader?name=LineUpJS.js.map!lineupjs/build/LineUpJS.js.map';
import '!file-loader?name=LineUpJS.css.map!lineupjs/build/LineUpJS.css.map';

import {Tooltip, Carousel, FloatingActionButton, toast} from 'materialize-css';
import 'file-loader?name=index.html!extract-loader!html-loader?interpolate!./index.html';
import './assets/favicon/favicon';
import './style.scss';
import 'typeface-roboto/index.css';
import initExport from './export';
import shared from './shared';
import {IDataset, fromFile, allDatasets, checkFiles, ISession, PRELOADED_TYPE, createCard} from './data';
import {storeDataset, storeSession, deleteDataset, editDataset} from './data/db';
import {saveDialog, areyousure} from './ui';

declare const LineUpJS: {version: string};

function forEach(selector: string, callback: (d: HTMLElement)=>void) {
  Array.from(document.querySelectorAll<HTMLElement>(selector)).forEach(callback);
}

const uploader = <HTMLElement>document.querySelector('main');

function build(builder: Promise<IDataset>, session?: ISession | null) {
  uploader.dataset.state = 'uploading';
  return builder.then((d: IDataset) => {
    shared.dataset = d;
    return d.build(<HTMLElement>document.querySelector('div.lu-c'));
  }).then((l) => {
    shared.lineup = l;
    disableBubbling(<HTMLElement>document.querySelector('div.lu-c > main > main'), 'mousemove', 'mouseout', 'mouseover');
    return new Promise<any>((resolve) => setTimeout(resolve, 500));
  }).then(() => {
    // patch switch button
    const side = <HTMLElement>document.querySelector('.lu-rule-button-chooser');
    if (side) {
      side.classList.add('switch');
      const input = (<HTMLElement>side.querySelector('input'));
      input.insertAdjacentHTML('afterend', `<span class="lever"></span>`);
      input.insertAdjacentHTML('beforebegin', `<span>Item</span>`);
    } //
    (<HTMLElement>document.querySelector('.brand-logo')).textContent = document.title = `LineUp ${shared.dataset!.name}`;
    forEach('.export-dataset, .save-session', (d) => {
      d.classList.remove('disabled');
    });
    forEach('.edit-dataset, .delete-dataset', (d) => {
      d.style.display = shared.dataset!.type === PRELOADED_TYPE ? 'none' : '';
    });
  }).then(() => {
    let next: string;
    if (session) {
      shared.session = session;
      next = `#${shared.dataset!.id}@${session.uid}`;
      shared.lineup!.data.restore(session.dump);
    } else {
      shared.session = null;
      next = `#${shared.dataset!.id}`;

      if (shared.dataset!.dump) {
        shared.lineup!.data.restore(shared.dataset!.dump);
      }
    }
    if (location.hash !== next) {
      location.assign(next);
    }
    return new Promise<any>((resolve) => setTimeout(resolve, 1000));
  }).then(() => {
    uploader.dataset.state = 'ready';
  }).catch((error) => {
    console.error(error);
    uploader.dataset.state = 'initial';
    toast({html: `<pre>${error}</pre>`, displayLength: 5000});
  });
}

function loadSession(session?: ISession) {
  if (!session || !shared.lineup) {
    shared.session = null;
    return;
  }
  shared.session = session;
  shared.lineup.data.restore(session.dump);
  location.replace(`#${shared.dataset!.id}@${session.uid}`);
}

function disableBubbling(node: HTMLElement, ...events: string[]) {
  for (const event of events) {
    node.addEventListener(event, (evt) => evt.stopPropagation());
  }
}

function refreshCarousel(focus?: number) {
  const base = <HTMLElement>document.querySelector('.carousel');
  const instance = Carousel.getInstance(base);
  if (instance) {
    instance.destroy();
  }
  const newInstance = Carousel.init(base);
  if (focus != null) {
    newInstance.set(focus);
  } else if (base.dataset.focus) {
    const id = parseInt(base.dataset.focus, 10);
    delete base.dataset.focus;
    newInstance.set(id);
  }
}

function ensureCarousel() {
  const base = <HTMLElement>document.querySelector('.carousel');
  const instance = Carousel.getInstance(base);
  if (!instance) {
    refreshCarousel();
  }
}

function markCarouselForRefresh(tohighlight: number) {
  // destroy such that it has to be recreated when visible
  const base = <HTMLElement>document.querySelector('.carousel');
  const instance = Carousel.getInstance(base);
  if (instance) {
    instance.destroy();
  }
  base.dataset.focus = tohighlight.toString();
}

function reset() {
  if (shared.lineup) {
    shared.lineup.destroy();
    shared.lineup = null;
  }
  shared.dataset = null;
  shared.session = null;
  (<HTMLElement>document.querySelector('.brand-logo')).textContent = document.title = `LineUp`;
  forEach('.export-dataset, .save-session', (d) => {
    d.classList.add('disabled');
  });
  forEach('.edit-dataset, .delete-dataset', (d) => {
    d.style.display = 'none';
  });
  uploader.dataset.state = 'initial';
  ensureCarousel();
}

async function deleteDatasetFromUI(dataset: IDataset) {
  try {
    await areyousure(`to delete dataset "${dataset.name}"`);
    await deleteDataset(dataset);
    toast({html: `Dataset "${dataset.name}" deleted`, displayLength: 5000});
    const index = shared.datasets!.findIndex((d) => d.id === dataset.id);
    shared.datasets!.splice(index, 1);

    const card = document.querySelector<HTMLElement>(`.card[data-id="${dataset.id}"]`);
    if (card) {
      card.remove();
      refreshCarousel(index % shared.datasets!.length);
    }

    if (shared.dataset === dataset) {
      // delete active one
      reset();
    }
  } catch (error) {
    console.error(error);
    toast({html: `Error while deleting dataset: <pre>${error}</pre>`, displayLength: 5000});
  }
}

async function editDatasetInUI(dataset: IDataset) {
  try {
    const desc = await saveDialog(`Edit dataset "${dataset.name}"`, dataset.name, dataset.description);
    dataset.name = desc.name;
    dataset.description = desc.description;
    await editDataset(dataset);

    forEach(`.card[data-id="${dataset.id}"] .dd-title`, (d) => d.innerHTML = dataset.name);
    forEach(`.card[data-id="${dataset.id}"] .dd-desc`, (d) => d.innerHTML = dataset.description);

    if (dataset === shared.dataset) {
      // edit current visible one, update title
      (<HTMLElement>document.querySelector('.brand-logo')).textContent = document.title = `LineUp ${dataset.name}`;
    }

    toast({html: `Dataset "${dataset.name}" edited`, displayLength: 5000});
  } catch (error) {
    console.error(error);
    toast({html: `Error while editing dataset: <pre>${error}</pre>`, displayLength: 5000});
  }
}

function addToCarousel(dataset: IDataset) {
  const base = <HTMLElement>document.querySelector('.carousel');
  const node = createCard(dataset, deleteDatasetFromUI, editDatasetInUI);
  node.dataset.id = dataset.id;
  base.appendChild(node);
}

function recreateCard(dataset: IDataset) {
  const base = <HTMLElement>document.querySelector('.carousel');
  const card = document.querySelector<HTMLElement>(`.card[data-id="${dataset.id}"]`)!;
  const node = createCard(dataset, deleteDatasetFromUI, editDatasetInUI);
  node.dataset.id = dataset.id;
  base.insertBefore(node, card);
  card.remove();
  markCarouselForRefresh(shared.datasets!.indexOf(dataset));
}

function handleFileList(files: FileList) {
  switch(files.length) {
    case 0:
      toast({html: `No file selected!`, displayLength: 5000});
      break;
    case 1:
      showFile(files[0]);
      break;
    case 2:
      checkFiles(Array.from(files))
        .then((dataset) => {
          showDataset(dataset);
        })
        .catch((error) => {
          toast({html: `<pre>${error}</pre>`, displayLength: 5000});
        });
      break;
    default:
      toast({html: `Too many files selected! Choose 1 or 2 files only.`, displayLength: 5000});
  }
}

function showFile(file: File) {
  fromFile(file)
    .then((dataset) => {
      showDataset(dataset);
    })
    .catch((error) => {
      toast({html: `<pre>${error}</pre>`, displayLength: 5000});
    });
}

function showDataset(dataset: IDataset) {
  reset();
  shared.datasets.push(dataset);
  addToCarousel(dataset);
  refreshCarousel();
  storeDataset(dataset);
  build(Promise.resolve(dataset));
}

async function saveSession() {
  if (!shared.lineup || !shared.dataset) {
    return;
  }
  try {
    // dump and parse to get rid of not cloneable things
    const dump = JSON.parse(JSON.stringify(shared.lineup.dump()));
    const desc = await saveDialog('Save Session as &hellip;', 'Auto Save');
    const session = await storeSession(shared.dataset, desc.name, dump);
    toast({html: `Session "${session.name}" of dataset "${shared.dataset.name}" saved`, displayLength: 5000});
    shared.dataset.sessions!.unshift(session); // since newest
    shared.session = session;
    location.replace(`#${shared.dataset!.id}@${session.uid}`);
    recreateCard(shared.dataset);
  } catch (error) {
    toast({html: `Error while saving session: <pre>${error}</pre>`, displayLength: 5000});
  }
}

window.addEventListener('resize', () => {
  setTimeout(() => {
    if (shared.lineup) {
      shared.lineup.update();
    }
  }, 100);
}, {
  passive: false
});

initExport();


FloatingActionButton.init(document.querySelectorAll('.fixed-action-btn'), {
  direction: 'left'
});
Tooltip.init(document.querySelectorAll('.tooltipped'));

{
  // update version info
  document.querySelector<HTMLElement>('.version-info')!.innerHTML = `LineUp.js v${LineUpJS.version}`;
}

document.querySelector<HTMLElement>('.save-session')!.onclick = (evt) => {
  evt.preventDefault();
  evt.stopPropagation();
  saveSession();
};

document.querySelector<HTMLElement>('.edit-dataset')!.onclick = (evt) => {
  evt.preventDefault();
  evt.stopPropagation();
  if (shared.dataset) {
    editDatasetInUI(shared.dataset);
  }
};

document.querySelector<HTMLElement>('.delete-dataset')!.onclick = (evt) => {
  evt.preventDefault();
  evt.stopPropagation();
  if (shared.dataset) {
    deleteDatasetFromUI(shared.dataset);
  }
};

forEach('.modal-close', (d) => d.onclick = (evt) => {
  evt.preventDefault();
});


allDatasets().then((data) => {
  shared.datasets = data;
  {
    const file = document.querySelector<HTMLInputElement>('input[type=file]')!;
    file.addEventListener('change', () => {
      handleFileList(file.files!);
    }
    );
    document.querySelector<HTMLElement>('#dropper a.btn')!.addEventListener('click', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      file.click();
    }
    );
    uploader.addEventListener('dragover', (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
    }
    );
    uploader.addEventListener('drop', (evt) => {
      handleFileList(evt.dataTransfer!.files!);
      evt.preventDefault();
    }
    );
  }

  for (const d of data) {
    addToCarousel(d);
  }
  refreshCarousel();

  const findSession = (dataset?: IDataset, sessionUID?: string) => {
    const uid = sessionUID ? parseInt(sessionUID, 10) : NaN;
    if (!sessionUID || isNaN(uid) || !dataset || !dataset.sessions || dataset.sessions.length === 0) {
      return null;
    }
    return dataset.sessions.find((d) => d.uid === uid);
  };

  // handle hash changes
  const findAndLoadViaHash = (doReset: boolean = true) => {
    const h = location.hash.slice(1).split('@');
    const newDataset = data.find((d) => d.id === h[0]);
    const session = findSession(newDataset, h[1]);
    if (newDataset === shared.dataset) {
      if (session && session !== shared.session) {
        loadSession(session);
      }
      return;
    }
    if (doReset) {
      reset();
    }
    if (!newDataset) {
      return;
    }
    build(Promise.resolve(newDataset), session);
  };
  window.addEventListener('hashchange', () => findAndLoadViaHash(true));
  findAndLoadViaHash(false);
});

declare const __DEBUG__: boolean;

// register service worker
if (!__DEBUG__ && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').then((registration) => {
    console.log('SW registered: ', registration);
  }).catch((registrationError) => {
    console.warn('SW registration failed: ', registrationError);
    });
  });
}
