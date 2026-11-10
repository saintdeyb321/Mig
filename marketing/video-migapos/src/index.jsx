import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Promo} from './Promo.jsx';
import {video} from './timeline.mjs';
import './styles.css';

function Root() {
  return <Composition {...video} component={Promo} />;
}

registerRoot(Root);
