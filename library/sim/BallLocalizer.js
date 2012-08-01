Sim.BallLocalizer = function() {
	this.balls = [];
};

Sim.BallLocalizer.BallId = 0;

Sim.BallLocalizer.Ball = function(x, y) {
	this.id = Sim.BallLocalizer.BallId++;
	this.positions = [];
	this.positionCounter = 0;
	this.created = Sim.Util.getMicrotime();
	this.updated = this.created;
	this.x = null;
	this.y = null;
	this.elasticity = sim.conf.ballLocalizer.ballElasticity;
	this.radius = sim.conf.ball.radius;
	this.velocityX = 0;
	this.velocityY = 0;
	
	this.addMeasurement(x, y);
};

Sim.BallLocalizer.Ball.prototype.addMeasurement = function(x, y, dt) {
	this.positions[this.positionCounter] = {x: x, y: y};
	this.positionCounter = (this.positionCounter + 1) % sim.conf.ballLocalizer.ballPositionAverages;
	this.updated = Sim.Util.getMicrotime();
	
	var position = this.getPosition();
	
	if (this.x != null && this.y != null) {
		this.velocityX = (position.x - this.x) / dt;
		this.velocityY = (position.y - this.y) / dt;
		
		//sim.dbg.box('#' + this.id, this.velocityX + ',' + this.velocityY);
	}
	
	this.x = position.x;
	this.y = position.y;
};

Sim.BallLocalizer.Ball.prototype.getPosition = function() {
	var xSum = 0,
		ySum = 0,
		samples = 0;
	
	for (var i = 0; i < sim.conf.ballLocalizer.ballPositionAverages; i++) {
		if (typeof(this.positions[i]) != 'object') {
			continue;
		}
		
		xSum += this.positions[i].x;
		ySum += this.positions[i].y;
		
		samples++;
	}
	
	return {
		x: xSum / samples,
		y: ySum / samples
	};
};

Sim.BallLocalizer.Ball.prototype.interpolate = function(dt) {
	this.x += this.velocityX * dt;
	this.y += this.velocityY * dt;
	
	var xSign = this.velocityX > 0 ? 1 : -1,
		ySign = this.velocityY > 0 ? 1 : -1,
		stepDrag = sim.conf.ballLocalizer.ballDrag * dt;
	
	if (Math.abs(this.velocityX) > stepDrag) {
		this.velocityX -= stepDrag * xSign;
	} else {
		this.velocityX = 0;
	}
	
	if (Math.abs(this.velocityY) > stepDrag) {
		this.velocityY -= stepDrag * ySign;
	} else {
		this.velocityY = 0;
	}

	Sim.Math.collideWalls(this);
};

Sim.BallLocalizer.prototype.update = function(
	robotX,
	robotY,
	robotOrientation,
	balls,
	dt
) {
	var ballX,
		ballY,
		newBall,
		angle,
		closestBall,
		handledBalls = [],
		i;
	
	for (i = 0; i < balls.length; i++) {
		angle = robotOrientation + balls[i].angle;
		
		ballX = robotX + Math.cos(angle) * balls[i].distance;
		ballY = robotY + Math.sin(angle) * balls[i].distance;
		
		closestBall = this.getBallAround(ballX, ballY);
		
		if (closestBall != null) {
			closestBall.addMeasurement(ballX, ballY, dt);
			
			handledBalls.push(closestBall.id);
		} else {
			newBall = new Sim.BallLocalizer.Ball(ballX, ballY);
			
			this.balls.push(newBall);
			
			handledBalls.push(newBall.id);
		}
	}
	
	for (i = 0; i < this.balls.length; i++) {
		if (handledBalls.indexOf(parseInt(this.balls[i].id)) != -1) {
			continue;
		}
		
		this.balls[i].interpolate(dt);
	}
	
	this.purge(balls);
};

Sim.BallLocalizer.prototype.getBallAround = function(x, y) {
	var distance,
		ball,
		minDistance = null,
		closestBall = null,
		i;
	
	for (i = 0; i < this.balls.length; i++) {
		ball = this.balls[i];
		
		distance = Sim.Math.getDistanceBetween(
			{x: ball.x, y: ball.y},
			{x: x, y: y}
		);
				
		if (
			distance <= sim.conf.ballLocalizer.maxBallIdentityDistance
			&& (
				minDistance == null
				|| distance < minDistance
			)
		) {
			minDistance = distance;
			closestBall = ball;
		}
	}
	
	return closestBall;
};

Sim.BallLocalizer.prototype.purge = function(visibleBalls) {
	var remainingBalls = [],
		i;
		
	for (i = 0; i < this.balls.length; i++) {
		if (this.isValid(this.balls[i], visibleBalls)) {
			remainingBalls.push(this.balls[i]);
		}
	}
	
	this.balls = remainingBalls;
};

Sim.BallLocalizer.prototype.isValid = function(ball, visibleBalls) {
	if (Sim.Util.confine(ball, 0, sim.conf.field.width, 0, sim.conf.field.height, sim.conf.ball.radius)) {
		return false;
	}
	
	var currentTime = Sim.Util.getMicrotime();
	
	if (currentTime - ball.updated > sim.conf.ballLocalizer.ballPurgeLifetime) {
		return false;
	}
	
	var velocityMagnitude = Sim.Math.getVectorLength(ball.velocityX, ball.velocityY);
	
	if (velocityMagnitude > sim.conf.ballLocalizer.ballMaxVelocity) {
		sim.dbg.console('too fast', velocityMagnitude, sim.conf.ballLocalizer.ballMaxVelocity);
		
		return false;
	}
	
	if (sim.game.isBallInYellowGoal(this) || sim.game.isBallInBlueGoal(this)) {
		return false;
	}
	
	return true;
};