import themes from './themes';
import cursors from './cursors';
import Position from './Position';
import GameState from './GameState';
import Estimator from './Estimator';
import {
  generatePosition,
  generateTeam,
  typeList,
  generateTheme,
} from './generators';
import { getPropagation, changePlayers } from './utils';

export default class GameController {
  constructor(gamePlay, stateService, side) {
    this.side = side;
    this.enemySide = changePlayers[side];
    this.gamePlay = gamePlay;
    this.estimator = new Estimator(this);
    this.stateService = stateService;
    this.gameState = new GameState(this, stateService);
    this.generateTheme = generateTheme();
    this.activePosition = null;
    if (!this.loadGame()) {
      this.teamSize = 20;
      this.maxCharacterLevel = 4;
      this.gameStage = 1;
    }
    setInterval(() => this.timer += 1, 1000);
  }

  init() {
    this.gamePlay.init(this.theme);
    this.timer = 0;
    this.turn = 0;
    this.demo = true;
    this.onCellClick = this.gameState.traceAction(this.click);
    this.gamePlay.addCellEnterListener(this.onCellEnter.bind(this));
    this.gamePlay.addCellLeaveListener(this.onCellLeave.bind(this));
    this.gamePlay.addCellClickListener(this.onCellClick.bind(this));
    this.gamePlay.addNewGameListener(this.gamePlay.showModal.bind(this));
    this.gamePlay.addSaveGameListener(() => console.log('save'));
    this.gamePlay.addLoadGameListener(() => console.log('load'));
    this.gamePlay.addDemoGameListener(() => console.log('demo'));
  }

  loadGame() {
    console.log('loadGame');
    console.log(this.stateService.loadStatus);
    if (this.stateService.loadStatus) {
      this.gameState.recoverGame();
      return true;
    }
    return false;
  }

  generateTeams() {
    console.log('generateTeams');
    this.evilTeam = generateTeam(
      typeList.slice(0, typeList.length / 2),
      this.maxCharacterLevel,
      this.teamSize,
    );
    this.goodTeam = generateTeam(
      typeList.slice(typeList.length / 2),
      this.maxCharacterLevel,
      this.teamSize,
    );

    this.position = new Position([
      ...generatePosition(this.goodTeam, this.gamePlay.boardSize, this.side),
      ...generatePosition(this.evilTeam, this.gamePlay.boardSize, this.enemySide),
    ]);
  }

  set timer(value) {
    this._timer = value;
    this.gamePlay.updateTimer(value);
  }

  get timer() {
    return this._timer;
  }

  set gameStage(value) {
    console.log('gameStage');
    if (value - this._gameStage === 1) {
      this.generateTeams();
    }
    this.theme = this.generateTheme.next().value;
    this._gameStage = value;
    this.init();
  }

  get gameStage() {
    return this._gameStage;
  }

  set turn(value) {
    console.log('set turn');
    if (value - this._turn === 1) {
      [this.side, this.enemySide] = [this.enemySide, this.side];
    }
    this._turn = value;
    this.position.currentTurn = this._turn;
    this.position.gameStage = this.gameStage;
    this.characterCells = this.position.getAllIndex();
    this.playerCharacterCells = this.position.getTeamPosition(this.side);
    this.enemyCharacterCells = this.position.getTeamPosition(this.enemySide);
    this.gamePlay.redrawPositions(this.position);
    if (this.checkWinner()) return null;
    if (this.side === this.estimator.side || this.demo) this.enemyAction();
    return null;
  }

  get turn() {
    return this._turn;
  }

  checkWinner() {
    if (!this.playerCharacterCells.length * this.enemyCharacterCells.length) {
      const winner = this.position.getPositionByIndex(this.characterCells[0]).character.side;
      console.log(winner);
      this.gameStage += 1;
      return true;
    }
  }

  enemyAction() {
    setTimeout(() => {
      this.estimator.requestStrategy();
    }, 50);
  }

  async click(index) {
    await this.action(index);
  }

  onCellEnter(index) {
    const position = this.position.getPositionByIndex(index);
    if (position) {
      const message = position.getMessage();
      this.gamePlay.showCellTooltip(message, index);
    }

    if (this.activePosition) {
      if (this.transitionСells.includes(index)) {
        this.gamePlay.selectCell(index, 'green');
        this.gamePlay.setCursor(cursors.pointer);
        this.action = this.movePosition;
      } else if (this.attackСells.includes(index)) {
        this.gamePlay.selectCell(index, 'red');
        this.gamePlay.setCursor(cursors.crosshair);
        this.action = this.attackPosition;
      } else if (this.playerCharacterCells.includes(index)) {
        this.gamePlay.setCursor(cursors.pointer);
        this.action = this.activatePosition;
      } else {
        this.gamePlay.setCursor(cursors.notallowed);
        this.gamePlay.enterCell(index);
        this.action = () => this.gamePlay.showError('Недоступное действие!');
      }
    } else {
      this.gamePlay.enterCell(index);
      this.action = this.activatePosition;
    }
  }

  onCellLeave(index) {
    this.gamePlay.leaveCells(index);
    this.gamePlay.hideCellTooltip(index);
    this.action = null;
    if (this.activePosition && this.activePosition.position !== index) {
      this.gamePlay.deselectCell(index);
    }
  }

  async movePosition(index) {
    const position = this.activePosition;
    this.deactivatePosition();
    this.gamePlay.deselectCell(index);
    await this.gamePlay.animateAction(position.position, index, 'move');
    position.position = index;
  }

  async attackPosition(index) {
    const position = this.position.getPositionByIndex(index);
    const damage = position.character.getDamage(this.activePosition.character.attack);
    await this.gamePlay.animateAction(this.activePosition.position, index, 'attack', this.side);
    this.deactivatePosition();
    this.gamePlay.deselectCell(index);
    await this.gamePlay.showDamage(index, damage);
  }

  activatePosition(index) {
    this.deactivatePosition();
    const position = this.position.getPositionByIndex(index);
    if (position) {
      if (position.character.side === this.side) {
        this.activePosition = position;
        this.gamePlay.selectCell(index);
        this.distributionCells(index);
        this.gamePlay.highlightCell(this.transitionСells);
      }
    }
  }

  deactivatePosition() {
    if (this.activePosition) {
      this.gamePlay.deselectCell(this.activePosition.position);
      this.gamePlay.dehighlightCell();
      this.gamePlay.setCursor(cursors.auto);
      this.action = this.activatePosition;
      this.activePosition = null;
      this.transitionСells = [];
      this.attackСells = [];
    }
  }

  distributionCells(index) {
    const { distance, range } = this.activePosition.character;
    this.transitionСells = getPropagation(index, distance, this.gamePlay.boardSize)
      .filter((element) => !this.characterCells.includes(element));
    this.attackСells = getPropagation(index, range, this.gamePlay.boardSize)
      .filter((element) => this.enemyCharacterCells.includes(element));
  }
}
